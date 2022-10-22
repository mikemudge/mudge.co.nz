FROM python:3.10.7

RUN pip3 install --upgrade pip

COPY ./requirements.txt /app/requirements.txt

RUN pip3 install -r /app/requirements.txt

# Copy all the code over last as that will change most often.
COPY . /app
WORKDIR /app

CMD run_app.sh

EXPOSE 5000
