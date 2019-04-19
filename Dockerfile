FROM ubuntu:latest
MAINTAINER Michael Mudge "michael@mudge.co.nz"

# Avoid annoying questions when installing.
ENV DEBIAN_FRONTEND noninteractive
# Apply updates
RUN apt-get update -y
RUN apt-get -y dist-upgrade
RUN apt-get clean

RUN apt-get install -y python3-dev python3-pip
RUN apt-get install -y jq uwsgi-plugin-python3 build-essential postgresql

COPY . /app
WORKDIR /app

RUN pip3 install --upgrade pip
RUN pip3 install -r requirements.txt

CMD docker/run_app.sh

EXPOSE 5000
