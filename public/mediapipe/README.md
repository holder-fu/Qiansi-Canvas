# Local face detection assets

The MediaPipe models and WebAssembly runtime files in this directory are redistributed under the Apache License 2.0. See [LICENSE-APACHE-2.0.txt](./LICENSE-APACHE-2.0.txt). The original download locations are recorded below so release artifacts remain traceable.

`blaze_face_short_range.tflite` is the official MediaPipe short-range face detector model used by the canvas face-selection step.

Source: https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite

`selfie_segmenter.tflite` is the official MediaPipe on-device person segmentation model used to create transparent PNG portrait cutouts without calling an AI provider.

Source: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite

`selfie_multiclass_256x256.tflite` is the higher-quality MediaPipe multi-class person segmentation model used as the primary portrait-cutout model. The smaller selfie segmenter remains an offline fallback.

Source: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite

`magic_touch.tflite` is the official MediaPipe interactive segmentation model used after automatic person-anchor detection to isolate complete people from character sheets and reject detached clothing or body-part samples.

Source: https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite

`pose_landmarker_full.task` is the official MediaPipe Pose Landmarker Full bundle used by the permission-gated motion-capture plugin to extract up to four 33-point poses from local video frames. The source video is decoded in the plugin iframe and bounded frame images are processed by the host without an external upload.

Source: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task

SHA-256: `4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad`

`pose_landmarker_lite.task` is the official MediaPipe Pose Landmarker Lite bundle retained for offline compatibility and reproducible quality comparisons.

Source: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task

SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`

The files under `wasm/` are copied unchanged from the installed `@mediapipe/tasks-vision` package and are intentionally excluded from source linting as third-party generated runtime assets.
