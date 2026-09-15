#!/usr/bin/env python3
"""Build deterministic multipart Qiansi Audio core packages.

Model snapshots are intentionally excluded.  The resulting independent ZIP
parts are extracted into the engine install directory and are described by an
engine-specific manifest containing the exact byte count and SHA-256 of every
part.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable
from urllib.parse import quote, urlparse


DEFAULT_MAX_PART_BYTES = 1_800_000_000
MIN_PART_BYTES = 16 * 1024 * 1024
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
EXCLUDED_PARTS = {".git", ".cache", "__pycache__"}
EXCLUDED_FILES = {".qiansi-install-receipt.json"}


class BuildError(RuntimeError):
    pass


@dataclass(frozen=True)
class SourceFile:
    source: Path
    relative: PurePosixPath
    bytes: int


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BuildError(f"Cannot read JSON {path}: {exc}") from exc


def is_excluded(relative: PurePosixPath) -> bool:
    parts = relative.parts
    if relative.name in EXCLUDED_FILES:
        return True
    if len(parts) >= 2 and parts[0] == "runtime" and parts[1] in {"models", "model-cache"}:
        return True
    if any(part in EXCLUDED_PARTS for part in parts):
        return True
    return relative.suffix.lower() in {".pyc", ".pyo"}


def collect_core_files(engine_root: Path) -> list[SourceFile]:
    if not engine_root.is_dir():
        raise BuildError(f"Engine directory is missing: {engine_root}")
    files: list[SourceFile] = []
    for path in sorted(engine_root.rglob("*"), key=lambda item: item.as_posix().casefold()):
        if path.is_symlink():
            raise BuildError(f"Symlinks are not allowed in a core package: {path}")
        if not path.is_file():
            continue
        relative = PurePosixPath(path.relative_to(engine_root).as_posix())
        if is_excluded(relative):
            continue
        files.append(SourceFile(path, relative, path.stat().st_size))
    if not files:
        raise BuildError(f"Engine core has no files after exclusions: {engine_root}")
    return files


def estimate_zip_overhead(file: SourceFile) -> int:
    # Stored ZIP uses one local and one central header per file.  Reserve extra
    # space for UTF-8 names and ZIP64 metadata so the final archive remains
    # strictly below the configured upload limit.
    name_bytes = len(file.relative.as_posix().encode("utf-8"))
    return 256 + 2 * name_bytes


def partition_files(files: Iterable[SourceFile], max_part_bytes: int) -> list[list[SourceFile]]:
    if max_part_bytes < MIN_PART_BYTES:
        raise BuildError(f"--max-part-bytes must be at least {MIN_PART_BYTES}.")
    reserve = min(16 * 1024 * 1024, max_part_bytes // 8)
    payload_limit = max_part_bytes - reserve
    parts: list[list[SourceFile]] = []
    current: list[SourceFile] = []
    estimated = 0
    for file in files:
        required = file.bytes + estimate_zip_overhead(file)
        if required >= payload_limit:
            raise BuildError(
                f"A single core file cannot fit below the part limit: {file.relative} "
                f"({file.bytes} bytes)."
            )
        if current and estimated + required >= payload_limit:
            parts.append(current)
            current = []
            estimated = 0
        current.append(file)
        estimated += required
    if current:
        parts.append(current)
    return parts


def write_zip_part(path: Path, files: list[SourceFile]) -> None:
    partial = path.with_suffix(path.suffix + ".partial")
    try:
        with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            for file in files:
                info = zipfile.ZipInfo(file.relative.as_posix(), ZIP_TIMESTAMP)
                info.compress_type = zipfile.ZIP_STORED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                with file.source.open("rb") as source, archive.open(info, "w", force_zip64=True) as target:
                    for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
                        target.write(block)
        os.replace(partial, path)
    finally:
        if partial.exists():
            partial.unlink()


def ensure_output_available(paths: Iterable[Path], force: bool) -> None:
    existing = [path for path in dict.fromkeys(paths) if path.exists()]
    if existing and not force:
        joined = ", ".join(path.name for path in existing[:5])
        raise BuildError(f"Output already exists ({joined}); pass --force to replace generated assets.")
    if force:
        for path in existing:
            path.unlink()


def normalize_release_base_url(value: str | None, *, required: bool) -> str | None:
    if value is None:
        if required:
            raise BuildError(
                "--release-base-url is required for a real build so every generated part "
                "has a fixed HTTPS source URL."
            )
        return None
    url = value.rstrip("/")
    parsed = urlparse(url)
    path_parts = [part for part in parsed.path.split("/") if part]
    if (
        parsed.scheme != "https"
        or parsed.hostname != "github.com"
        or parsed.query
        or parsed.fragment
        or len(path_parts) != 5
        or path_parts[2:4] != ["releases", "download"]
    ):
        raise BuildError(
            "--release-base-url must be a fixed GitHub Release URL in the form "
            "https://github.com/<owner>/<repo>/releases/download/<tag>."
        )
    if "${" in url or "}" in url:
        raise BuildError("--release-base-url cannot contain a runtime placeholder.")
    return url


def build_engine(
    *,
    engine: dict,
    plugin_version: str,
    plugin_root: Path,
    output_root: Path,
    max_part_bytes: int,
    release_base_url: str | None,
    dry_run: bool,
    force: bool,
) -> dict:
    install_directory = engine["installDirectory"]
    engine_root = plugin_root / "engines" / install_directory
    files = collect_core_files(engine_root)
    worker = engine["worker"]
    worker_path = engine_root / PurePosixPath(worker["path"])
    actual_worker_hash = sha256_file(worker_path)
    if actual_worker_hash != worker["sha256"]:
        raise BuildError(
            f"Worker hash mismatch for {install_directory}: catalog={worker['sha256']} "
            f"actual={actual_worker_hash}"
        )

    partitions = partition_files(files, max_part_bytes)
    stem = f"qiansi-audio-{install_directory}-core-v{plugin_version}"
    part_paths = [output_root / f"{stem}.part-{index:03d}.zip" for index in range(1, len(partitions) + 1)]
    manifest_path = output_root / f"{stem}.manifest.json"
    if not dry_run:
        previous_outputs = [
            *output_root.glob(f"{stem}.part-*.zip"),
            *output_root.glob(f"{stem}.part-*.zip.partial"),
            *part_paths,
            manifest_path,
        ]
        ensure_output_available(previous_outputs, force)

    part_records = []
    for index, (path, partition) in enumerate(zip(part_paths, partitions), start=1):
        uncompressed_bytes = sum(file.bytes for file in partition)
        if dry_run:
            part_records.append(
                {
                    "index": index,
                    "name": path.name,
                    "bytes": None,
                    "sha256": None,
                    "fileCount": len(partition),
                    "uncompressedBytes": uncompressed_bytes,
                    "sources": (
                        [
                            {
                                "provider": "github-release",
                                "url": f"{release_base_url}/{quote(path.name, safe='')}",
                            }
                        ]
                        if release_base_url
                        else []
                    ),
                }
            )
            continue
        write_zip_part(path, partition)
        archive_bytes = path.stat().st_size
        if archive_bytes >= max_part_bytes:
            raise BuildError(
                f"Generated part exceeds the strict limit: {path.name}={archive_bytes}, "
                f"limit={max_part_bytes}"
            )
        part_records.append(
            {
                "index": index,
                "name": path.name,
                "bytes": archive_bytes,
                "sha256": sha256_file(path),
                "fileCount": len(partition),
                "uncompressedBytes": uncompressed_bytes,
                "sources": [
                    {
                        "provider": "github-release",
                        "url": f"{release_base_url}/{quote(path.name, safe='')}",
                    }
                ],
            }
        )

    result = {
        "schemaVersion": 1,
        "packageId": f"qiansi-audio-{install_directory}-core",
        "generatorId": engine["generatorId"],
        "pluginVersion": plugin_version,
        "installDirectory": install_directory,
        "format": "multipart-zip",
        "maxPartBytesExclusive": max_part_bytes,
        "releaseBaseUrl": release_base_url,
        "source": engine["source"],
        "worker": worker,
        "excluded": [
            "runtime/models/**",
            "runtime/model-cache/**",
            "**/.git/**",
            "**/.cache/**",
            "**/__pycache__/**",
            "**/*.pyc",
            "**/*.pyo",
            ".qiansi-install-receipt.json",
        ],
        "totalBytes": None if dry_run else sum(part["bytes"] for part in part_records),
        "totalUncompressedBytes": sum(part["uncompressedBytes"] for part in part_records),
        "parts": part_records,
    }
    if not dry_run:
        manifest_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        release_parts = [part for part in urlparse(str(release_base_url)).path.split("/") if part]
        manifest_url = f"{release_base_url}/{quote(manifest_path.name, safe='')}"
        core_artifact = next(
            artifact
            for artifact in engine["artifacts"]
            if artifact.get("kind") == "core"
        )
        result["catalogArtifact"] = {
            "id": core_artifact["id"],
            "kind": "core",
            "destination": ".",
            "format": "multipart-zip",
            "bytes": result["totalBytes"],
            "sha256": None,
            "installedBytes": result["totalUncompressedBytes"],
            "published": True,
            "releaseManifest": manifest_url,
            "manifest": {
                "bytes": manifest_path.stat().st_size,
                "sha256": sha256_file(manifest_path),
            },
            "sources": [
                {
                    "provider": "github-release",
                    "url": manifest_url,
                    "repoId": f"{release_parts[0]}/{release_parts[1]}",
                    "revision": release_parts[4],
                }
            ],
        }
    result["manifestName"] = manifest_path.name
    return result


def parse_args(values: list[str]) -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]
    default_plugin = (
        project_root
        if (project_root / "plugin.json").is_file()
        else project_root / "data" / "plugins" / "qiansi-audio"
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--plugin-root",
        type=Path,
        default=default_plugin,
    )
    parser.add_argument("--catalog", type=Path)
    parser.add_argument("--output", type=Path, default=project_root / "release" / "qiansi-audio-core")
    parser.add_argument("--engine", action="append", help="Generator id or install directory; repeatable.")
    parser.add_argument("--max-part-bytes", type=int, default=DEFAULT_MAX_PART_BYTES)
    parser.add_argument(
        "--release-base-url",
        help=(
            "Fixed HTTPS GitHub Release asset base. Required unless --dry-run; "
            "runtime placeholders are rejected."
        ),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args(values)


def main(values: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if values is None else values)
    plugin_root = args.plugin_root.resolve()
    catalog_path = (args.catalog or plugin_root / "install" / "catalog.json").resolve()
    catalog = read_json(catalog_path)
    if catalog.get("schemaVersion") != 1:
        raise BuildError("Only install catalog schemaVersion 1 is supported.")
    plugin_version = str(catalog.get("pluginVersion") or "")
    engines = catalog.get("engines")
    if not plugin_version or not isinstance(engines, list):
        raise BuildError("Catalog is missing pluginVersion or engines.")

    requested = set(args.engine or [])
    selected = [
        engine
        for engine in engines
        if not requested
        or engine.get("generatorId") in requested
        or engine.get("installDirectory") in requested
    ]
    matched = {value for value in requested if any(value in {e.get("generatorId"), e.get("installDirectory")} for e in selected)}
    if requested - matched:
        raise BuildError(f"Unknown engine(s): {', '.join(sorted(requested - matched))}")

    output_root = args.output.resolve()
    release_base_url = normalize_release_base_url(
        args.release_base_url,
        required=not args.dry_run,
    )
    if not args.dry_run:
        output_root.mkdir(parents=True, exist_ok=True)
        ensure_output_available([output_root / "qiansi-audio-core-packages.json"], args.force)
    results = [
        build_engine(
            engine=engine,
            plugin_version=plugin_version,
            plugin_root=plugin_root,
            output_root=output_root,
            max_part_bytes=args.max_part_bytes,
            release_base_url=release_base_url,
            dry_run=args.dry_run,
            force=args.force,
        )
        for engine in selected
    ]
    summary = {
        "schemaVersion": 1,
        "pluginVersion": plugin_version,
        "dryRun": args.dry_run,
        "maxPartBytesExclusive": args.max_part_bytes,
        "engines": results,
    }
    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        summary_path = output_root / "qiansi-audio-core-packages.json"
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for engine in results:
            for part in engine["parts"]:
                print(f"{part['name']}\t{part['bytes']}\t{part['sha256']}")
        print(f"Manifest: {summary_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BuildError as exc:
        print(f"Qiansi Audio core package build failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
