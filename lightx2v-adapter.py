"""Small, non-shell adapter between Qiansi-Canvas and LightX2V's Python API."""

from __future__ import annotations

import json
import os
import sys


def fail(message: str) -> None:
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    raise SystemExit(1)


def main() -> None:
    try:
        request = json.load(sys.stdin)
    except Exception as exc:  # pragma: no cover - surfaced to the bridge
        fail(f"无法读取 LightX2V 请求：{exc}")

    try:
        from lightx2v import LightX2VPipeline
    except Exception as exc:
        fail(f"无法导入 lightx2v：{exc}")

    model_path = str(request.get("modelPath") or "").strip()
    model_class = str(request.get("modelClass") or "").strip()
    task = str(request.get("task") or "").strip()
    config_path = str(request.get("configPath") or "").strip()
    output_path = os.path.abspath(str(request.get("outputPath") or "").strip())
    if not model_path or not model_class or task not in {"t2i", "i2i", "t2v", "i2v"}:
        fail("模型目录、模型类型或任务类型配置不完整。")
    if not config_path or not os.path.isfile(config_path):
        fail("LightX2V config_json 文件不存在。")
    if not output_path:
        fail("未指定输出文件。")

    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        pipeline = LightX2VPipeline(model_path=model_path, model_cls=model_class, task=task)
        pipeline.create_generator(config_json=config_path)
        generate_args = {
            "seed": int(request.get("seed") or 42),
            "prompt": str(request.get("prompt") or ""),
            "negative_prompt": str(request.get("negativePrompt") or ""),
            "save_result_path": output_path,
        }
        image_path = str(request.get("imagePath") or "").strip()
        if image_path:
            generate_args["image_path"] = image_path
        pipeline.generate(**generate_args)
    except Exception as exc:  # pragma: no cover - depends on the installed runtime/model
        fail(f"LightX2V 推理失败：{exc}")

    if not os.path.isfile(output_path) or os.path.getsize(output_path) <= 0:
        fail("LightX2V 已结束，但没有生成有效文件。")
    print(json.dumps({"ok": True, "outputPath": output_path}, ensure_ascii=False))


if __name__ == "__main__":
    main()
