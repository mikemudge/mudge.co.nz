# This matches the version which is run on my droplet (not using docker)
FROM python:3.6.9
MAINTAINER Michael Mudge "michael@mudge.co.nz"

RUN pip3 install --upgrade pip

COPY . /app
WORKDIR /app

RUN pip3 install -r frozen_requirements.txt

CMD docker/run_app.sh

EXPOSE 5000
