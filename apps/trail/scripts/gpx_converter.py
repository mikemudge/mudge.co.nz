#!/usr/bin/env python3

import json
import sys

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: %s <infile> <outfile>' % sys.args[0])
        exit()

    in_filename = sys.argv[1]
    out_filename = sys.argv[2]

    # Use this site to convert xml(gpx) into json.
    # http://www.utilities-online.info/xmltojson

    with open(in_filename) as data_file:
        data = json.load(data_file)
        data = data['gpx']
        paths = []

        tracks = data['trk']
        if not isinstance(tracks, list):
            # If the gpx only has one trk item them the converter doesn't use a list.
            tracks = [data['trk']]

        for track in tracks:
            print(track['name'])
            new_path = []
            for track_point in track['trkseg']['trkpt']:
                new_path.append({
                    'lat': track_point['-lat'],
                    'lng': track_point['-lon'],
                })
            new_segment = {
                'name': track['name'],
                'points': new_path
            }
            paths.append(new_segment)

    with open(out_filename, 'w') as outfile:
        json.dump(paths, outfile, indent=2, sort_keys=True)
