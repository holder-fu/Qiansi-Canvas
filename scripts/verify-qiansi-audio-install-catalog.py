#!/usr/bin/env python3
"""Verify Qiansi Audio install catalog, model manifests and optional local payloads."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import quote, urlencode, urlparse


SHA256 = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
SEMVER = re.compile(
    r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)
GITHUB_RELEASE_SEGMENT = re.compile(r"^[A-Za-z0-9._+-]+$")
EXPECTED_ENGINES = {
    "qwen3-tts-local": {
        "directory": "qwen3tts",
        "repository": "https://github.com/QwenLM/Qwen3-TTS.git",
        "commit": "022e286b98fbec7e1e916cb940cdf532cd9f488e",
        "license": "Apache-2.0",
        "commercialUse": True,
        "installedBytes": 19_558_073_587,
        "models": {
            "qwen3tts-base": ["modelscope", "huggingface"],
            "qwen3tts-custom-voice": ["modelscope", "huggingface"],
            "qwen3tts-voice-design": ["modelscope", "huggingface"],
        },
    },
    "voxcpm2-local": {
        "directory": "voxcpm2",
        "repository": "https://github.com/OpenBMB/VoxCPM.git",
        "commit": "19b6bf7590025418821a86dcb817504e0ad7e5df",
        "license": "Apache-2.0",
        "commercialUse": True,
        "installedBytes": 10_392_115_030,
        "models": {
            "voxcpm2-model": ["modelscope", "huggingface"],
            "voxcpm2-zipenhancer": ["modelscope"],
        },
    },
    "cosyvoice3-local": {
        "directory": "cosyvoice3",
        "repository": "https://github.com/QwenAudio/CosyVoice.git",
        "commit": "074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc",
        "license": "Apache-2.0",
        "commercialUse": True,
        "installedBytes": 15_599_831_396,
        "models": {"cosyvoice3-model": ["modelscope", "huggingface"]},
    },
    "chattts-local": {
        "directory": "chattts",
        "repository": "https://github.com/2noise/ChatTTS.git",
        "commit": "77b89ee281cd479f5b1a787ada330dc975ca1f2a",
        "license": "AGPL-3.0-or-later",
        "commercialUse": False,
        "installedBytes": 8_509_597_148,
        "models": {"chattts-model": ["huggingface"]},
    },
    "woosh-local": {
        "directory": "woosh",
        "repository": "https://github.com/SonyResearch/Woosh.git",
        "commit": "f6ff658efc6d63dee9959964cd75c63415910a19",
        "license": "MIT",
        "commercialUse": False,
        "installedBytes": 14_000_000_000,
        "layoutVersion": 2,
        "pythonWindows": "runtime/app/Woosh/.venv/Scripts/python.exe",
        "models": {"woosh-roberta-large": ["huggingface"]},
        "releaseModels": {
            "woosh-dflow": {
                "destination": "runtime/app/Woosh/checkpoints/Woosh-DFlow",
                "bytes": 1_281_505_601,
                "sha256": "26cfe732500e3952c58aaaf433d29d75b46d42afe5e52f49430d6093eabfdb04",
                "installedBytes": 1_500_000_000,
                "stripComponents": 2,
                "url": "https://github.com/SonyResearch/Woosh/releases/download/v1.0.0/Woosh-DFlow.zip",
            },
            "woosh-text-conditioner-a": {
                "destination": "runtime/app/Woosh/checkpoints/TextConditionerA",
                "bytes": 1_297_121_262,
                "sha256": "68a777b9ac28aa5daf6017b21af9a3659de75074ea14dac65f5231a42c375193",
                "installedBytes": 1_500_000_000,
                "stripComponents": 2,
                "url": "https://github.com/SonyResearch/Woosh/releases/download/v1.0.0/TextConditionerA.zip",
            },
            "woosh-ae": {
                "destination": "runtime/app/Woosh/checkpoints/Woosh-AE",
                "bytes": 822_991_075,
                "sha256": "d6f77e3792ee43c21da580f39d6576e0da3e4b46b949223259adf36036c1f9af",
                "installedBytes": 1_000_000_000,
                "stripComponents": 2,
                "url": "https://github.com/SonyResearch/Woosh/releases/download/v1.0.0/Woosh-AE.zip",
            },
        },
    },
    "acestep-xl-local": {
        "directory": "acestep-xl",
        "repository": "https://github.com/ace-step/ACE-Step-1.5.git",
        "commit": "dce621408bee8c31b4fcf4811682eb9359e1bc94",
        "license": "MIT",
        "commercialUse": True,
        "installedBytes": 70_000_000_000,
        "pythonWindows": "runtime/app/ACE-Step-1.5/.venv/Scripts/python.exe",
        "models": {
            "acestep-xl-shared": ["huggingface"],
            "acestep-v15-xl-turbo": ["huggingface"],
            "acestep-v15-xl-sft": ["huggingface"],
        },
    },
}

WOOSH_RUNTIME_BOOTSTRAP = {
    "python-runtime": {
        "provider": "python-org",
        "url": "https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip",
        "destination": "runtime/python",
        "format": "zip",
        "bytes": 11_133_606,
        "sha256": "4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3",
        "installedBytes": 30_000_000,
    },
    "pip-bootstrap": {
        "provider": "pypa",
        "url": "https://bootstrap.pypa.io/get-pip.py",
        "destination": "runtime/bootstrap/get-pip.py",
        "format": "file",
        "bytes": 2_230_488,
        "sha256": "fb24e693bab954209a063d90953621412ccad4a500905a726286e038f508ddf6",
        "installedBytes": None,
    },
    "uv-runtime": {
        "provider": "github-release",
        "url": "https://github.com/astral-sh/uv/releases/download/0.12.1/uv-x86_64-pc-windows-msvc.zip",
        "destination": "runtime/tools/uv",
        "format": "zip",
        "bytes": 19_073_343,
        "sha256": "8fcb0cb46e1229065e344758980924e569bef5882ef45f46fada8fb24e06b74a",
        "installedBytes": 60_000_000,
    },
}


class VerificationError(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise VerificationError(f"Cannot read JSON {path}: {exc}") from exc
    require(isinstance(value, dict), f"JSON root must be an object: {path}")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_relative(value: object, label: str) -> PurePosixPath:
    require(isinstance(value, str) and value, f"{label} must be a non-empty string.")
    require("\\" not in value, f"{label} must use forward slashes: {value}")
    path = PurePosixPath(value)
    require(not path.is_absolute(), f"{label} must be relative: {value}")
    require(all(part not in {"", ".", ".."} for part in path.parts), f"Unsafe {label}: {value}")
    return path


def exact_keys(value: dict, expected: set[str], label: str) -> None:
    actual = set(value)
    require(actual == expected, f"{label} keys mismatch: expected {sorted(expected)}, got {sorted(actual)}")


def github_release_base(value: object, label: str) -> tuple[str, str, str]:
    require(isinstance(value, str) and value, f"{label} must be a non-empty string.")
    parsed = urlparse(value)
    require(
        parsed.scheme == "https"
        and parsed.hostname == "github.com"
        and parsed.username is None
        and parsed.password is None
        and parsed.port is None
        and not parsed.params
        and not parsed.query
        and not parsed.fragment,
        f"{label} must be a fixed GitHub Release HTTPS base URL: {value}",
    )
    parts = parsed.path.split("/")
    require(
        len(parts) == 6
        and parts[0] == ""
        and parts[3:5] == ["releases", "download"]
        and all(GITHUB_RELEASE_SEGMENT.fullmatch(part) for part in (parts[1], parts[2], parts[5])),
        f"{label} must match https://github.com/<owner>/<repo>/releases/download/<tag>: {value}",
    )
    require("${" not in value and not value.endswith("/"), f"{label} must be fixed and have no trailing slash.")
    return f"{parts[1]}/{parts[2]}", parts[5], value


def encoded_path(path: str) -> str:
    return "/".join(quote(part, safe="") for part in PurePosixPath(path).parts)


def expected_file_url(source: dict, path: str) -> str:
    provider = source["provider"]
    repo_id = source["repoId"]
    encoded = encoded_path(path)
    if provider == "modelscope":
        require(source.get("revision") is None, "ModelScope revision must be null until an immutable id is verified.")
        query = urlencode({"Revision": "master", "FilePath": path})
        return f"https://modelscope.cn/api/v1/models/{repo_id}/repo?{query}"
    if provider == "huggingface":
        revision = source.get("revision")
        require(isinstance(revision, str) and COMMIT.fullmatch(revision), "Hugging Face revision must be a full commit.")
        return f"https://huggingface.co/{repo_id}/resolve/{revision}/{encoded}?download=true"
    raise VerificationError(f"Unsupported model provider: {provider}")


def verify_source_url(source: dict, expected_provider: str, file_path: str | None = None) -> None:
    require(source.get("provider") == expected_provider, f"Expected provider {expected_provider}.")
    require(isinstance(source.get("repoId"), str) and "/" in source["repoId"], "Source repoId is invalid.")
    revision = source.get("revision")
    if expected_provider == "modelscope":
        require(revision is None, "Unverified ModelScope revisions must remain null.")
    elif expected_provider == "huggingface":
        require(isinstance(revision, str) and COMMIT.fullmatch(revision), "Hugging Face source is not commit-pinned.")
    url = source.get("url")
    require(isinstance(url, str), "Source URL is missing.")
    parsed = urlparse(url)
    expected_host = "modelscope.cn" if expected_provider == "modelscope" else "huggingface.co"
    require(parsed.scheme == "https" and parsed.hostname == expected_host, f"Unexpected source URL: {url}")
    if file_path is not None:
        require(url == expected_file_url(source, file_path), f"Source is not the fixed direct link for {file_path}: {url}")


def verify_model_manifest(
    *, catalog_root: Path, artifact: dict, expected_providers: list[str]
) -> tuple[dict, int]:
    manifest_rel = safe_relative(artifact.get("manifest"), f"{artifact.get('id')} manifest")
    manifest_path = catalog_root / Path(*manifest_rel.parts)
    manifest = read_json(manifest_path)
    require(manifest.get("schemaVersion") == 1, f"Bad manifest schema: {manifest_path}")
    require(manifest.get("artifactId") == artifact.get("id"), f"Manifest artifact id mismatch: {manifest_path}")
    require(manifest.get("bytes") == artifact.get("bytes"), f"Manifest byte total mismatch: {manifest_path}")
    files = manifest.get("files")
    require(isinstance(files, list) and files, f"Manifest contains no files: {manifest_path}")
    seen: set[str] = set()
    total = 0
    for file in files:
        require(isinstance(file, dict), f"Invalid file entry: {manifest_path}")
        path = safe_relative(file.get("path"), "model file path").as_posix()
        require(path not in seen, f"Duplicate model file path: {path}")
        seen.add(path)
        size = file.get("bytes")
        require(isinstance(size, int) and size >= 0, f"Invalid byte count for {path}")
        require(isinstance(file.get("sha256"), str) and SHA256.fullmatch(file["sha256"]), f"Invalid SHA-256 for {path}")
        sources = file.get("sources")
        require(isinstance(sources, list), f"File sources are missing for {path}")
        require([source.get("provider") for source in sources] == expected_providers, f"Wrong provider order for {path}")
        for source, provider in zip(sources, expected_providers):
            require(isinstance(source, dict), f"Invalid source for {path}")
            verify_source_url(source, provider, path)
        total += size
    require(total == manifest["bytes"], f"File byte sum mismatch: {manifest_path}")
    return manifest, len(files)


def verify_woosh_runtime_bootstrap(value: object) -> None:
    require(isinstance(value, dict), "Woosh runtimeBootstrap is missing.")
    exact_keys(value, {"artifacts"}, "Woosh runtimeBootstrap")
    artifacts = value.get("artifacts")
    require(isinstance(artifacts, list), "Woosh runtimeBootstrap.artifacts must be a list.")
    require(
        [artifact.get("id") for artifact in artifacts if isinstance(artifact, dict)]
        == list(WOOSH_RUNTIME_BOOTSTRAP),
        "Woosh runtimeBootstrap must contain fixed Python 3.12, PyPA and uv artifacts in order.",
    )
    for artifact in artifacts:
        require(isinstance(artifact, dict), "Invalid Woosh runtime bootstrap artifact.")
        expected = WOOSH_RUNTIME_BOOTSTRAP[artifact["id"]]
        required_keys = {
            "id",
            "kind",
            "destination",
            "format",
            "bytes",
            "sha256",
            "sources",
        }
        if expected["installedBytes"] is not None:
            required_keys.add("installedBytes")
        exact_keys(artifact, required_keys, f"Woosh {artifact['id']} runtime artifact")
        require(artifact.get("kind") == "core", f"Woosh {artifact['id']} must be a core artifact.")
        for field in ("destination", "format", "bytes", "sha256"):
            require(
                artifact.get(field) == expected[field],
                f"Woosh {artifact['id']} {field} mismatch.",
            )
        if expected["installedBytes"] is not None:
            require(
                artifact.get("installedBytes") == expected["installedBytes"],
                f"Woosh {artifact['id']} installedBytes mismatch.",
            )
        sources = artifact.get("sources")
        require(isinstance(sources, list) and len(sources) == 1, f"Woosh {artifact['id']} must use one source.")
        exact_keys(sources[0], {"provider", "url"}, f"Woosh {artifact['id']} source")
        require(sources[0].get("provider") == expected["provider"], f"Woosh {artifact['id']} provider mismatch.")
        require(sources[0].get("url") == expected["url"], f"Woosh {artifact['id']} URL mismatch.")


def verify_woosh_release_model(artifact: dict, expected: dict) -> None:
    artifact_id = artifact.get("id")
    exact_keys(
        artifact,
        {
            "id",
            "kind",
            "destination",
            "format",
            "bytes",
            "sha256",
            "installedBytes",
            "stripComponents",
            "license",
            "commercialUse",
            "sources",
        },
        f"Woosh release model {artifact_id}",
    )
    require(artifact.get("kind") == "model", f"Woosh release artifact must be a model: {artifact_id}")
    require(artifact.get("format") == "zip", f"Woosh release model must be a ZIP: {artifact_id}")
    for field in ("destination", "bytes", "sha256", "installedBytes", "stripComponents"):
        require(artifact.get(field) == expected[field], f"Woosh release model {field} mismatch: {artifact_id}")
    require(artifact.get("license") == "CC-BY-NC-4.0", f"Woosh model license mismatch: {artifact_id}")
    require(artifact.get("commercialUse") is False, f"Woosh model must remain non-commercial: {artifact_id}")
    sources = artifact.get("sources")
    require(isinstance(sources, list) and len(sources) == 1, f"Woosh model must use one release source: {artifact_id}")
    exact_keys(sources[0], {"provider", "url"}, f"Woosh release source {artifact_id}")
    require(sources[0].get("provider") == "github-release", f"Woosh release provider mismatch: {artifact_id}")
    require(sources[0].get("url") == expected["url"], f"Woosh release URL mismatch: {artifact_id}")


def verify_official_catalog(
    catalog: dict, catalog_path: Path, plugin_root: Path
) -> tuple[dict, list[tuple[dict, dict]]]:
    exact_keys(
        catalog,
        {"schemaVersion", "catalogId", "pluginVersion", "runtimeBootstrap", "engines"},
        "official-source catalog",
    )
    bootstrap = catalog.get("runtimeBootstrap")
    require(isinstance(bootstrap, dict), "runtimeBootstrap is missing.")
    exact_keys(bootstrap, {"artifacts"}, "runtimeBootstrap")
    bootstrap_artifacts = bootstrap.get("artifacts")
    require(isinstance(bootstrap_artifacts, list), "runtimeBootstrap.artifacts must be a list.")
    require(
        [artifact.get("id") for artifact in bootstrap_artifacts]
        == ["python-runtime", "pip-bootstrap"],
        "runtimeBootstrap must contain Python.org then PyPA.",
    )
    expected_bootstrap = {
        "python-runtime": (
            "python-org",
            "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embeddable-amd64.zip",
            "runtime/python",
            "zip",
        ),
        "pip-bootstrap": (
            "pypa",
            "https://bootstrap.pypa.io/get-pip.py",
            "runtime/bootstrap/get-pip.py",
            "file",
        ),
    }
    for artifact in bootstrap_artifacts:
        require(isinstance(artifact, dict), "Invalid runtime bootstrap artifact.")
        expected = expected_bootstrap[artifact["id"]]
        require(artifact.get("kind") == "core", "Runtime bootstrap kind must be core.")
        require(artifact.get("destination") == expected[2], "Runtime bootstrap destination mismatch.")
        require(artifact.get("format") == expected[3], "Runtime bootstrap format mismatch.")
        require(isinstance(artifact.get("bytes"), int) and artifact["bytes"] > 0, "Runtime bootstrap bytes are invalid.")
        require(isinstance(artifact.get("sha256"), str) and SHA256.fullmatch(artifact["sha256"]), "Runtime bootstrap SHA-256 is invalid.")
        sources = artifact.get("sources")
        require(isinstance(sources, list) and len(sources) == 1, "Runtime bootstrap must use one source.")
        require(sources[0].get("provider") == expected[0], "Runtime bootstrap provider mismatch.")
        require(sources[0].get("url") == expected[1], "Runtime bootstrap URL mismatch.")

    engines = catalog.get("engines")
    require(isinstance(engines, list), "engines must be a list.")
    require({engine.get("generatorId") for engine in engines} == set(EXPECTED_ENGINES), "Engine set mismatch.")
    verified_manifests: list[tuple[dict, dict]] = []
    catalog_root = catalog_path.parent
    for engine in engines:
        require(isinstance(engine, dict), "Invalid engine entry.")
        generator_id = engine.get("generatorId")
        expected = EXPECTED_ENGINES[generator_id]
        require(engine.get("installDirectory") == expected["directory"], f"Wrong directory for {generator_id}")
        require(engine.get("license") == expected["license"], f"Wrong source license for {generator_id}")
        require(engine.get("commercialUse") is expected["commercialUse"], f"Wrong commercial flag for {generator_id}")
        require(engine.get("installedBytes") == expected["installedBytes"], f"Wrong installed bytes for {generator_id}")
        if "layoutVersion" in expected:
            require(engine.get("layoutVersion") == expected["layoutVersion"], f"Wrong layout version for {generator_id}")
        else:
            require("layoutVersion" not in engine, f"Unexpected layout version for {generator_id}")
        source = engine.get("source")
        require(isinstance(source, dict), f"Source is missing for {generator_id}")
        exact_keys(source, {"repository", "commit"}, f"Source identity for {generator_id}")
        require(source.get("repository") == expected["repository"], f"Wrong official source for {generator_id}")
        require(
            source.get("commit") == expected["commit"] and COMMIT.fullmatch(source["commit"]),
            f"Wrong source commit for {generator_id}",
        )

        if generator_id in {"woosh-local", "acestep-xl-local"}:
            verify_woosh_runtime_bootstrap(engine.get("runtimeBootstrap"))
        else:
            require("runtimeBootstrap" not in engine, f"Unexpected per-engine runtimeBootstrap for {generator_id}")

        entrypoints = engine.get("entrypoints")
        require(isinstance(entrypoints, dict), f"Entrypoints are missing for {generator_id}")
        exact_keys(entrypoints, {"worker", "pythonWindows"}, f"Entrypoints for {generator_id}")
        require(entrypoints.get("worker") == "service/worker.py", f"Worker entrypoint mismatch for {generator_id}")
        expected_python = expected.get("pythonWindows", "runtime/python/python.exe")
        require(entrypoints.get("pythonWindows") == expected_python, f"Python entrypoint mismatch for {generator_id}")

        worker = engine.get("worker")
        require(isinstance(worker, dict), f"Worker is missing for {generator_id}")
        exact_keys(worker, {"path", "sha256"}, f"Worker metadata for {generator_id}")
        require(worker.get("path") == entrypoints["worker"], f"Worker path mismatch for {generator_id}")
        require(isinstance(worker.get("sha256"), str) and SHA256.fullmatch(worker["sha256"]), f"Worker SHA-256 is invalid for {generator_id}")
        recipe = engine.get("officialInstall")
        require(isinstance(recipe, dict), f"officialInstall is missing for {generator_id}")
        require(
            set(recipe).issubset({"localFiles", "packages", "requirementsFiles", "uvSync"}),
            f"Unknown officialInstall field for {generator_id}",
        )
        local_files = recipe.get("localFiles")
        require(isinstance(local_files, list) and local_files, f"localFiles are missing for {generator_id}")
        worker_adapter_found = False
        for local_file in local_files:
            require(isinstance(local_file, dict), f"Invalid local adapter for {generator_id}")
            exact_keys(local_file, {"source", "destination", "sha256"}, f"Local adapter for {generator_id}")
            source_rel = safe_relative(local_file.get("source"), f"{generator_id} adapter source")
            require(source_rel.parts[0] == "adapters", f"Adapter must live under install/adapters: {generator_id}")
            source_path = catalog_root / Path(*source_rel.parts)
            require(source_path.is_file(), f"Adapter source is missing: {source_path}")
            require(sha256_file(source_path) == local_file.get("sha256"), f"Adapter SHA-256 mismatch: {source_path}")
            if local_file.get("destination") == worker["path"]:
                require(local_file.get("sha256") == worker["sha256"], f"Worker adapter hash mismatch for {generator_id}")
                worker_adapter_found = True
        require(worker_adapter_found, f"Worker adapter is missing from officialInstall for {generator_id}")
        packages = recipe.get("packages")
        require(isinstance(packages, list), f"packages must be a list for {generator_id}")
        for package in packages:
            require(
                isinstance(package, str)
                and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}==[A-Za-z0-9][A-Za-z0-9._+!-]{0,63}", package),
                f"Official PyPI package must be version-pinned: {generator_id}",
            )
        requirements_files = recipe.get("requirementsFiles", [])
        require(isinstance(requirements_files, list), f"requirementsFiles must be a list for {generator_id}")
        uv_sync = recipe.get("uvSync")
        require(packages or requirements_files or uv_sync is not None, f"Official install recipe is empty for {generator_id}")
        if generator_id in {"woosh-local", "acestep-xl-local"}:
            label = "Woosh" if generator_id == "woosh-local" else "ACE-Step"
            require(packages == [], f"{label} dependencies must come only from its fixed uv.lock.")
            require(requirements_files == [], f"{label} must not install an unfrozen requirements file.")
            require(isinstance(uv_sync, dict), f"{label} uvSync recipe is missing.")
            expected_uv_sync = (
                {
                    "project": "runtime/app/Woosh",
                    "executable": "runtime/tools/uv/uv.exe",
                    "python": "runtime/python/python.exe",
                    "extra": "cuda",
                }
                if generator_id == "woosh-local"
                else {
                    "project": "runtime/app/ACE-Step-1.5",
                    "executable": "runtime/tools/uv/uv.exe",
                    "python": "runtime/python/python.exe",
                }
            )
            exact_keys(uv_sync, set(expected_uv_sync), f"{label} uvSync")
            require(uv_sync == expected_uv_sync, f"{label} uvSync must use its fixed official project, uv and Python.")
        else:
            require(uv_sync is None, f"Unexpected uvSync recipe for {generator_id}")

        artifacts = engine.get("artifacts")
        require(isinstance(artifacts, list) and artifacts, f"Artifacts are missing for {generator_id}")
        models = expected["models"]
        release_models = expected.get("releaseModels", {})
        seen_models: set[str] = set()
        for artifact in artifacts:
            require(isinstance(artifact, dict), f"Invalid artifact for {generator_id}")
            require(artifact.get("format") != "multipart-zip", f"Maintainer core release remains in {generator_id}")
            sources = artifact.get("sources")
            artifact_id = artifact.get("id")
            if artifact.get("kind") == "model":
                if artifact_id in release_models:
                    verify_woosh_release_model(artifact, release_models[artifact_id])
                    seen_models.add(artifact_id)
                    continue
                require(
                    not isinstance(sources, list)
                    or all(source.get("provider") != "github-release" for source in sources),
                    f"Unexpected GitHub Release model source in {generator_id}",
                )
                providers = models.get(artifact_id)
                require(providers is not None, f"Unexpected model artifact: {artifact_id}")
                require(artifact.get("format") == "snapshot", f"Model snapshot format mismatch: {artifact_id}")
                require(artifact.get("sha256") is None, f"Snapshot must use per-file hashes: {artifact_id}")
                require([source.get("provider") for source in artifact["sources"]] == providers, f"Wrong source order for {artifact_id}")
                if artifact_id == "woosh-roberta-large":
                    require(
                        artifact.get("destination") == "runtime/app/Woosh/roberta-large",
                        "Woosh RoBERTa destination mismatch.",
                    )
                    require(artifact.get("bytes") == 2_711_511, "Woosh RoBERTa byte total mismatch.")
                    require(artifact.get("manifest") == "manifests/woosh-roberta-large.json", "Woosh RoBERTa manifest mismatch.")
                    require(artifact.get("license") == "MIT", "Woosh RoBERTa license mismatch.")
                    require(artifact.get("commercialUse") is True, "Woosh RoBERTa commercial flag mismatch.")
                    require(
                        artifact.get("sources")
                        == [
                            {
                                "provider": "huggingface",
                                "url": "https://huggingface.co/FacebookAI/roberta-large/tree/722cf37b1afa9454edce342e7895e588b6ff1d59",
                                "repoId": "FacebookAI/roberta-large",
                                "revision": "722cf37b1afa9454edce342e7895e588b6ff1d59",
                            }
                        ],
                        "Woosh RoBERTa must use the fixed official Hugging Face revision.",
                    )
                manifest, _ = verify_model_manifest(
                    catalog_root=catalog_root,
                    artifact=artifact,
                    expected_providers=providers,
                )
                seen_models.add(artifact_id)
                verified_manifests.append((engine, artifact))
            else:
                require(artifact.get("kind") == "source", f"Unexpected non-model artifact: {artifact_id}")
                require(
                    not isinstance(sources, list)
                    or all(source.get("provider") != "github-release" for source in sources),
                    f"Maintainer GitHub Release remains in {generator_id}",
                )
                require(artifact.get("format") == "zip", f"Official source must be a ZIP: {artifact_id}")
                require(isinstance(artifact.get("sha256"), str) and SHA256.fullmatch(artifact["sha256"]), f"Official source SHA-256 is invalid: {artifact_id}")
                require(isinstance(sources, list) and len(sources) == 1, f"Official source must use one URL: {artifact_id}")
                parsed = urlparse(sources[0].get("url", ""))
                require(sources[0].get("provider") == "github" and parsed.scheme == "https" and parsed.hostname == "github.com", f"Official source URL is invalid: {artifact_id}")
                if generator_id == "woosh-local":
                    require(artifact_id == "woosh-source", f"Unexpected Woosh source artifact: {artifact_id}")
                    require(artifact.get("destination") == "runtime/app/Woosh", "Woosh source destination mismatch.")
                    require(artifact.get("bytes") == 281_694, "Woosh source byte count mismatch.")
                    require(
                        artifact.get("sha256") == "bbe7aa8f33f2700efbd5bfee6b8265c902a1e7d5f678d3681092f9a5ed4c951e",
                        "Woosh source SHA-256 mismatch.",
                    )
                    require(artifact.get("installedBytes") == 10_000_000, "Woosh source installedBytes mismatch.")
                    require(artifact.get("stripComponents") == 1, "Woosh source stripComponents mismatch.")
                    require(
                        sources
                        == [
                            {
                                "provider": "github",
                                "url": "https://github.com/SonyResearch/Woosh/archive/f6ff658efc6d63dee9959964cd75c63415910a19.zip",
                            }
                        ],
                        "Woosh source must use its fixed commit archive.",
                    )
        require(seen_models == set(models) | set(release_models), f"Model artifact set mismatch for {generator_id}")
    return catalog, verified_manifests


def verify_catalog(catalog_path: Path, plugin_root: Path) -> tuple[dict, list[tuple[dict, dict]]]:
    catalog = read_json(catalog_path)
    require(catalog.get("schemaVersion") == 1, "Catalog schemaVersion must be 1.")
    plugin_manifest = read_json(plugin_root / "plugin.json")
    require(
        isinstance(catalog.get("pluginVersion"), str) and SEMVER.fullmatch(catalog["pluginVersion"]),
        "Catalog pluginVersion must be a valid semantic version.",
    )
    require(
        isinstance(plugin_manifest.get("version"), str) and SEMVER.fullmatch(plugin_manifest["version"]),
        "plugin.json version must be a valid semantic version.",
    )
    if "runtimeBootstrap" in catalog:
        return verify_official_catalog(catalog, catalog_path, plugin_root)
    release = catalog.get("coreRelease")
    require(isinstance(release, dict), "coreRelease is missing.")
    exact_keys(
        release,
        {"baseUrlTemplate", "overrideEnvironmentVariable", "published", "note"},
        "coreRelease",
    )
    require(release.get("overrideEnvironmentVariable") == "QIANSI_AUDIO_CORE_RELEASE_BASE_URL", "Core override variable mismatch.")
    require(isinstance(release.get("published"), bool), "coreRelease.published must be a boolean.")
    require(isinstance(release.get("note"), str), "coreRelease.note must be a string.")
    release_published = release["published"]
    release_base = release.get("baseUrlTemplate")
    release_repo_id: str | None = None
    release_revision: str | None = None
    if release_published:
        release_repo_id, release_revision, release_base = github_release_base(
            release_base, "coreRelease.baseUrlTemplate"
        )
    else:
        require(
            release_base == "${QIANSI_AUDIO_CORE_RELEASE_BASE_URL}",
            "Unpublished core URL must remain the non-resolvable release placeholder.",
        )

    engines = catalog.get("engines")
    require(isinstance(engines, list), "Catalog engines must be an array.")
    by_id = {engine.get("generatorId"): engine for engine in engines if isinstance(engine, dict)}
    require(set(by_id) == set(EXPECTED_ENGINES), "Catalog must contain exactly the supported generators.")
    require(len(by_id) == len(engines), "Generator ids must be unique.")
    catalog_root = catalog_path.parent
    verified_manifests: list[tuple[dict, dict]] = []

    for generator_id, expected in EXPECTED_ENGINES.items():
        engine = by_id[generator_id]
        require(engine.get("installDirectory") == expected["directory"], f"Wrong installDirectory for {generator_id}")
        require(engine.get("license") == expected["license"], f"Wrong code license for {generator_id}")
        require(engine.get("commercialUse") is expected["commercialUse"], f"Wrong commercialUse for {generator_id}")
        require(
            engine.get("installedBytes") == expected["installedBytes"],
            f"Wrong installedBytes for {generator_id}",
        )
        source = engine.get("source")
        require(isinstance(source, dict), f"Source metadata missing for {generator_id}")
        require(source.get("repository") == expected["repository"], f"Wrong official source for {generator_id}")
        require(source.get("commit") == expected["commit"] and COMMIT.fullmatch(source["commit"]), f"Source is not pinned for {generator_id}")

        worker = engine.get("worker")
        require(isinstance(worker, dict), f"Worker metadata missing for {generator_id}")
        worker_rel = safe_relative(worker.get("path"), f"{generator_id} worker")
        require(isinstance(worker.get("sha256"), str) and SHA256.fullmatch(worker["sha256"]), f"Invalid worker hash for {generator_id}")
        require(engine.get("entrypoints", {}).get("worker") == worker_rel.as_posix(), f"Worker entrypoint mismatch for {generator_id}")
        require(engine.get("entrypoints", {}).get("pythonWindows") == "runtime/python/python.exe", f"Python entrypoint mismatch for {generator_id}")
        local_worker = plugin_root / "engines" / expected["directory"] / Path(*worker_rel.parts)
        if local_worker.is_file():
            require(sha256_file(local_worker) == worker["sha256"], f"Local worker hash mismatch for {generator_id}")

        artifacts = engine.get("artifacts")
        require(isinstance(artifacts, list), f"Artifacts missing for {generator_id}")
        by_artifact = {artifact.get("id"): artifact for artifact in artifacts if isinstance(artifact, dict)}
        core_id = f"{expected['directory']}-core"
        core = by_artifact.get(core_id)
        require(isinstance(core, dict), f"Core artifact missing for {generator_id}")
        require(
            core.get("kind") == "core" and core.get("format") == "multipart-zip",
            f"Bad core format for {generator_id}",
        )
        require(core.get("published") is release_published, f"Core publication state mismatch for {generator_id}")
        require(core.get("sha256") is None, f"Multipart core SHA-256 must come from its release manifest: {generator_id}")
        core_sources = core.get("sources")
        require(isinstance(core_sources, list) and len(core_sources) == 1, f"Core source missing for {generator_id}")
        core_source = core_sources[0]
        require(isinstance(core_source, dict), f"Core source is invalid for {generator_id}")
        require(core_source.get("provider") == "github-release", f"Core source must be GitHub Release for {generator_id}")
        expected_manifest_name = f"qiansi-audio-{expected['directory']}-core-v{catalog['pluginVersion']}.manifest.json"
        release_manifest = core.get("releaseManifest")
        if release_published:
            require(
                isinstance(core.get("bytes"), int) and core["bytes"] > 0,
                f"Published core bytes are missing for {generator_id}",
            )
            require(
                isinstance(core.get("installedBytes"), int) and core["installedBytes"] > 0,
                f"Published core installedBytes are missing for {generator_id}",
            )
            expected_manifest_url = f"{release_base}/{quote(expected_manifest_name, safe='')}"
            require(
                release_manifest == expected_manifest_url,
                f"Published core manifest must use its fixed GitHub Release URL for {generator_id}",
            )
            require(core_source.get("url") == expected_manifest_url, f"Core source URL mismatch for {generator_id}")
            require(core_source.get("repoId") == release_repo_id, f"Core source repoId mismatch for {generator_id}")
            require(core_source.get("revision") == release_revision, f"Core source revision mismatch for {generator_id}")
            manifest_record = core.get("manifest")
            require(isinstance(manifest_record, dict), f"Published manifest metadata is missing for {generator_id}")
            exact_keys(manifest_record, {"bytes", "sha256"}, f"{generator_id} core manifest")
            require(
                isinstance(manifest_record.get("bytes"), int)
                and 0 < manifest_record["bytes"] <= 16 * 1024 * 1024,
                f"Published manifest byte count is invalid for {generator_id}",
            )
            require(
                isinstance(manifest_record.get("sha256"), str)
                and SHA256.fullmatch(manifest_record["sha256"]),
                f"Published manifest SHA-256 is invalid for {generator_id}",
            )
        else:
            require(
                core.get("bytes") is None and core.get("sha256") is None,
                f"Unpublished core metadata must remain null for {generator_id}",
            )
            require(
                release_manifest == f"${{QIANSI_AUDIO_CORE_RELEASE_BASE_URL}}/{expected_manifest_name}",
                f"Unpublished core manifest placeholder mismatch for {generator_id}",
            )
            require(
                core_source.get("url") == release_manifest,
                f"Unpublished core source must use its release placeholder for {generator_id}",
            )
            require(
                core_source.get("repoId") is None and core_source.get("revision") is None,
                f"Unpublished core source must not claim an unverified repository for {generator_id}",
            )
            require("manifest" not in core, f"Unpublished core must not claim manifest integrity for {generator_id}")

        expected_models = expected["models"]
        actual_model_ids = {artifact_id for artifact_id, artifact in by_artifact.items() if artifact.get("kind") == "model"}
        require(actual_model_ids == set(expected_models), f"Model artifact set mismatch for {generator_id}")
        for artifact_id, provider_order in expected_models.items():
            artifact = by_artifact[artifact_id]
            require(artifact.get("format") == "snapshot", f"Model artifact must use snapshot format: {artifact_id}")
            require(isinstance(artifact.get("bytes"), int) and artifact["bytes"] > 0, f"Model bytes missing: {artifact_id}")
            require(artifact.get("sha256") is None, f"Snapshot artifact uses per-file hashes, not a synthetic aggregate: {artifact_id}")
            safe_relative(artifact.get("destination"), f"{artifact_id} destination")
            sources = artifact.get("sources")
            require(isinstance(sources, list), f"Artifact sources missing: {artifact_id}")
            require([source.get("provider") for source in sources] == provider_order, f"Wrong artifact provider order: {artifact_id}")
            for source_record, provider in zip(sources, provider_order):
                verify_source_url(source_record, provider)
            manifest, _ = verify_model_manifest(
                catalog_root=catalog_root,
                artifact=artifact,
                expected_providers=provider_order,
            )
            for source_index, (provider, source_record) in enumerate(zip(provider_order, sources)):
                manifest_source = manifest["files"][0]["sources"][source_index]
                require(source_record.get("repoId") == manifest_source.get("repoId"), f"Repo id mismatch: {artifact_id}/{provider}")
                require(source_record.get("revision") == manifest_source.get("revision"), f"Revision mismatch: {artifact_id}/{provider}")
            verified_manifests.append((engine, artifact))
    return catalog, verified_manifests


def verify_installed_models(plugin_root: Path, pairs: list[tuple[dict, dict]], catalog_root: Path) -> None:
    for engine, artifact in pairs:
        manifest = read_json(catalog_root / artifact["manifest"])
        destination = plugin_root / "engines" / engine["installDirectory"] / Path(*PurePosixPath(artifact["destination"]).parts)
        require(destination.is_dir(), f"Installed model directory is missing: {destination}")
        for record in manifest["files"]:
            path = destination / Path(*PurePosixPath(record["path"]).parts)
            require(path.is_file(), f"Installed model file is missing: {path}")
            require(path.stat().st_size == record["bytes"], f"Installed model size mismatch: {path}")
            require(sha256_file(path) == record["sha256"], f"Installed model hash mismatch: {path}")


def verify_release_dir(release_dir: Path, catalog: dict) -> None:
    require(release_dir.is_dir(), f"Core release directory is missing: {release_dir}")
    release = catalog["coreRelease"]
    require(release.get("published") is True, "--release-dir requires a fully published core catalog.")
    _, _, catalog_release_base = github_release_base(
        release.get("baseUrlTemplate"), "coreRelease.baseUrlTemplate"
    )
    seen_local_names: set[str] = set()
    for engine in catalog["engines"]:
        core = next(artifact for artifact in engine["artifacts"] if artifact["kind"] == "core")
        manifest_url = core["releaseManifest"]
        manifest_name = PurePosixPath(urlparse(manifest_url).path).name
        require(
            manifest_name and manifest_name.casefold() not in seen_local_names,
            f"Core release manifest name is duplicate or empty: {manifest_name}",
        )
        seen_local_names.add(manifest_name.casefold())
        manifest_path = release_dir / manifest_name
        require(manifest_path.is_file(), f"Core package manifest is missing: {manifest_path}")
        manifest_record = core["manifest"]
        require(
            manifest_path.stat().st_size == manifest_record["bytes"],
            f"Core package manifest size mismatch: {manifest_path}",
        )
        require(
            sha256_file(manifest_path) == manifest_record["sha256"],
            f"Core package manifest hash mismatch: {manifest_path}",
        )
        manifest = read_json(manifest_path)
        exact_keys(
            manifest,
            {
                "schemaVersion",
                "packageId",
                "generatorId",
                "pluginVersion",
                "installDirectory",
                "format",
                "maxPartBytesExclusive",
                "releaseBaseUrl",
                "source",
                "worker",
                "excluded",
                "totalBytes",
                "totalUncompressedBytes",
                "parts",
            },
            f"core package manifest {manifest_path}",
        )
        require(manifest.get("schemaVersion") == 1, f"Bad core package manifest: {manifest_path}")
        require(
            manifest.get("packageId") == f"qiansi-audio-{engine['installDirectory']}-core",
            f"Core package id mismatch: {manifest_path}",
        )
        require(manifest.get("generatorId") == engine["generatorId"], f"Core generator mismatch: {manifest_path}")
        require(manifest.get("pluginVersion") == catalog["pluginVersion"], f"Core plugin version mismatch: {manifest_path}")
        require(manifest.get("installDirectory") == engine["installDirectory"], f"Core install directory mismatch: {manifest_path}")
        require(manifest.get("format") == "multipart-zip", f"Core format mismatch: {manifest_path}")
        limit = manifest.get("maxPartBytesExclusive")
        require(
            isinstance(limit, int) and not isinstance(limit, bool) and 0 < limit <= 1_800_000_000,
            f"Unsafe core part limit: {manifest_path}",
        )
        release_base_url = manifest.get("releaseBaseUrl")
        require(
            release_base_url == catalog_release_base,
            f"Core release base does not match catalog: {manifest_path}",
        )
        exact_keys(manifest["source"], {"repository", "commit"}, f"{manifest_path} source")
        require(manifest["source"] == engine["source"], f"Core source identity mismatch: {manifest_path}")
        exact_keys(manifest["worker"], {"path", "sha256"}, f"{manifest_path} worker")
        require(manifest["worker"] == engine["worker"], f"Core worker identity mismatch: {manifest_path}")
        excluded = manifest.get("excluded")
        require(
            isinstance(excluded, list) and all(isinstance(pattern, str) and pattern for pattern in excluded),
            f"Core excluded patterns are invalid: {manifest_path}",
        )
        require(
            manifest.get("totalBytes") == core["bytes"],
            f"Core compressed total does not match catalog: {manifest_path}",
        )
        require(
            manifest.get("totalUncompressedBytes") == core["installedBytes"],
            f"Core uncompressed total does not match catalog: {manifest_path}",
        )
        parts = manifest.get("parts")
        require(isinstance(parts, list) and parts, f"Core package contains no parts: {manifest_path}")
        compressed_total = 0
        uncompressed_total = 0
        seen_part_names: set[str] = set()
        for position, part in enumerate(parts, start=1):
            require(isinstance(part, dict), f"Invalid core package part: {manifest_path}")
            exact_keys(
                part,
                {"index", "name", "bytes", "sha256", "fileCount", "uncompressedBytes", "sources"},
                f"{manifest_path} part {position}",
            )
            require(part.get("index") == position, f"Core part indexes must be contiguous: {manifest_path}")
            relative_name = safe_relative(part.get("name"), f"{manifest_path} part name")
            require(
                len(relative_name.parts) == 1 and relative_name.suffix.casefold() == ".zip",
                f"Core package part must be a safe ZIP filename: {part.get('name')}",
            )
            expected_name = (
                f"qiansi-audio-{engine['installDirectory']}-core-v{catalog['pluginVersion']}"
                f".part-{position:03d}.zip"
            )
            require(relative_name.name == expected_name, f"Unexpected core package part name: {relative_name.name}")
            require(relative_name.name.casefold() not in seen_part_names, f"Duplicate core package part: {relative_name.name}")
            seen_part_names.add(relative_name.name.casefold())
            path = release_dir / relative_name.name
            require(path.is_file(), f"Core package part is missing: {path}")
            require(
                isinstance(part.get("bytes"), int)
                and not isinstance(part["bytes"], bool)
                and 0 < part["bytes"] < limit
                and path.stat().st_size == part["bytes"],
                f"Core package part size mismatch: {path}",
            )
            require(
                isinstance(part.get("sha256"), str) and SHA256.fullmatch(part["sha256"]),
                f"Core package part SHA-256 is invalid: {path}",
            )
            require(sha256_file(path) == part["sha256"], f"Core package part hash mismatch: {path}")
            require(
                isinstance(part.get("fileCount"), int)
                and not isinstance(part["fileCount"], bool)
                and part["fileCount"] > 0,
                f"Core package part file count is invalid: {path}",
            )
            require(
                isinstance(part.get("uncompressedBytes"), int)
                and not isinstance(part["uncompressedBytes"], bool)
                and part["uncompressedBytes"] > 0,
                f"Core package part uncompressed bytes are invalid: {path}",
            )
            sources = part.get("sources")
            require(
                isinstance(sources, list)
                and len(sources) == 1
                and isinstance(sources[0], dict),
                f"Core package part source is missing: {path}",
            )
            exact_keys(sources[0], {"provider", "url"}, f"{path} source")
            require(sources[0].get("provider") == "github-release", f"Core package part provider mismatch: {path}")
            expected_url = f"{catalog_release_base}/{quote(relative_name.name, safe='')}"
            require(sources[0].get("url") == expected_url, f"Core package part URL mismatch: {path}")
            compressed_total += part["bytes"]
            uncompressed_total += part["uncompressedBytes"]
        require(compressed_total == manifest["totalBytes"], f"Core package compressed total mismatch: {manifest_path}")
        require(
            uncompressed_total == manifest["totalUncompressedBytes"],
            f"Core package uncompressed total mismatch: {manifest_path}",
        )


def parse_args(values: list[str]) -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]
    default_plugin = (
        project_root
        if (project_root / "plugin.json").is_file()
        else project_root / "data" / "plugins" / "qiansi-audio"
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plugin-root", type=Path, default=default_plugin)
    parser.add_argument("--catalog", type=Path)
    parser.add_argument("--verify-installed-models", action="store_true")
    parser.add_argument("--release-dir", type=Path)
    return parser.parse_args(values)


def main(values: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if values is None else values)
    plugin_root = args.plugin_root.resolve()
    catalog_path = (args.catalog or plugin_root / "install" / "catalog.json").resolve()
    catalog, pairs = verify_catalog(catalog_path, plugin_root)
    if args.verify_installed_models:
        verify_installed_models(plugin_root, pairs, catalog_path.parent)
    if args.release_dir:
        require(
            "coreRelease" in catalog,
            "--release-dir only applies to the deprecated maintainer core-release catalog.",
        )
        verify_release_dir(args.release_dir.resolve(), catalog)
    model_files = sum(len(read_json(catalog_path.parent / artifact["manifest"])["files"]) for _, artifact in pairs)
    print(
        f"Qiansi Audio install catalog verified: {len(catalog['engines'])} engines, "
        f"{len(pairs)} model snapshots, {model_files} hashed files."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except VerificationError as exc:
        print(f"Qiansi Audio install catalog verification failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
