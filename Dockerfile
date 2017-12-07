FROM ubuntu:latest
MAINTAINER Michael Mudge "michael@mudge.co.nz"

# Apply updates
RUN apt-get update -y
RUN apt-get -y dist-upgrade
RUN apt-get clean
RUN apt-get install -y jq python-dev python-pip uwsgi-plugin-python3 build-essential \
  postgresql

COPY . /app
WORKDIR /app

RUN pip install --upgrade pip
RUN pip install -r requirements.txt

CMD docker/run_app.sh

EXPOSE 5000
