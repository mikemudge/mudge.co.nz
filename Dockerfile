# This matches the version which is run on my droplet (not using docker)

# Build stage: compiles wheels for everything in frozen_requirements.txt.
# uwsgi has no prebuilt wheels for most platforms, hence build-essential here.
FROM python:3.12-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /wheels
COPY frozen_requirements.txt .
RUN pip install --upgrade pip \
    && pip wheel -r frozen_requirements.txt

# Final stage: slim runtime, no compiler toolchain.
FROM python:3.12-slim
LABEL maintainer="Michael Mudge <michael@mudge.co.nz>"

WORKDIR /app

RUN --mount=type=bind,from=builder,source=/wheels,target=/wheels \
    pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --no-index --find-links=/wheels /wheels/*.whl

COPY . /app

CMD docker/run_app.sh

EXPOSE 5000
