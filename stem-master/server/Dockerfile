# Stem Master by MP Audio: separation server image.
#
# GPU host (default build: PyTorch's CUDA wheels from PyPI):
#   docker build -t stem-master-server stem-master/server
#   docker run --gpus all -p 7860:7860 -v stem-models:/data stem-master-server
#
# CPU-only build (a much smaller image; separation is slow without a GPU):
#   docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu \
#     -t stem-master-server:cpu stem-master/server
#
# Hugging Face Spaces (Docker SDK, app_port 7860) build this file unchanged.
# Space variables are passed to the build as build args, so a Space variable
# named TORCH_INDEX_URL selects a different PyTorch wheel index there too.
#
# Models are not baked into the image. They download into
# STEM_MASTER_MODEL_DIR (default /data/models) on first use, or ahead of time
# with:  docker run --rm -v stem-models:/data stem-master-server \
#          python -m stem_master prefetch --quality all

FROM python:3.11-slim

# Empty = PyPI's default torch wheel (bundles CUDA on Linux x86_64).
ARG TORCH_INDEX_URL=""

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# ffmpeg decodes uploads and encodes the AAC previews; libsndfile backs soundfile.
# gcc + libc6-dev: diffq (pulled in by audio-separator) ships no wheel for
# Python 3.11 and compiles a small C extension during pip install.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces run the container as uid 1000. /data is created here and
# owned by that user so a named Docker volume mounted on it inherits the owner.
RUN useradd --create-home --uid 1000 user \
    && mkdir -p /data \
    && chown user:user /data

USER user
ENV HOME=/home/user \
    VIRTUAL_ENV=/home/user/venv \
    PATH=/home/user/venv/bin:/home/user/.local/bin:$PATH
WORKDIR /home/user/app

RUN python -m venv "$VIRTUAL_ENV"

# torch first, from the requested index, so requirements.txt (audio-separator)
# finds it satisfied instead of pulling another build.
RUN if [ -n "$TORCH_INDEX_URL" ]; then \
        pip install --no-cache-dir torch --index-url "$TORCH_INDEX_URL"; \
    else \
        pip install --no-cache-dir torch; \
    fi

COPY --chown=user:user requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user:user stem_master/ ./stem_master/

ENV PORT=7860
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '7860') + '/v1/health', timeout=8)"]

CMD ["python", "-m", "stem_master", "serve"]
