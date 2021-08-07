#!/usr/bin/python3

import json
import requests
import time

def main():
	# Copy this from your chrome after authenticating.
	# TODO can we login via script?
	token = "Bearer eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJtdWRnZS5jby5ueiIsImV4cCI6MTYyODMwNDE2NSwiaWF0IjoxNjI4MzAwNTY1LCJpc3MiOiJtdWRnZS5jby5ueiIsInNjb3BlcyI6InVzZXIgYmFzaWMgcHJvZmlsZSByb2NrIHRyYWlsIHRvdXJuYW1lbnQgcmVhZF9wcm9maWxlIGFkbWluIGFkbWluIiwiY2xpZW50X2lkIjoibjF4S1duYUg2dWp3cW5rT2VjdFR4S0dhYVR4QlZlNkZsUG1WNkI2eSIsImNsaWVudCI6eyJpZCI6IjA1ZjIxYjZmLTlmYjUtNDI0Mi05YTA4LTFhZTg2OGFjOWVlOSIsImNsaWVudF9pZCI6Im4xeEtXbmFINnVqd3Fua09lY3RUeEtHYWFUeEJWZTZGbFBtVjZCNnkiLCJuYW1lIjoiV2ViIGNsaWVudCJ9LCJ1c2VyIjp7ImlkIjoiMTdmNGVjOTItNmEwMi00NjFlLTkyMTAtYjJjMGRiZDlkNjkyIiwiZW1haWwiOiJtaWtlLm11ZGdlQGdtYWlsLmNvbSJ9fQ.qgkyPRQQwBIYm4W2Lg1DB8O-IWwZ35u-mrYgu7yyc-ySheUpNUXXMNRYCZUC7SaHgEjpV19W17FvO9fAwwywsA"
	headers = {
		"Authorization": token
	}
	response = requests.post('http://localhost:5000/api/tournament/tournament', 
		json = {
			'name': 'Testing %d' % time.time(),
			'teams': [{
				'name': 'Team 1'
			},{
				'name': 'Team 2'
			},{
				'name': 'Team 3'
			},{
				'name': 'Team 4'
			}]
		}, 
		headers = headers)

	if response.status_code != 200:
		print(response.status_code)
		print(response.json())
	else:
		pk = response.json()['data']['id']
		print("New tournament with id", pk)
		tournament = requests.get('http://localhost:5000/api/tournament/tournament/%s' % pk, headers = headers)
		print("Tournament GET")
		print(tournament.json())

if __name__ == '__main__':
	main()
