#!/usr/bin/env python3

import json

if __name__ == '__main__':
    with open('static/trail/tour_aotearoa.json') as data_file:
        data = json.load(data_file)
        paths = []
        for path in data:
            print(path['name'])
            newpoints = []
            for p in path['points']:
                newpoints.append({
                    'lat': p['lng'],
                    'lng': p['lat'],
                    'alt': p.get('alt')
                })
            newplace = {
                'name': path['name'],
                'points': newpoints
            }
            paths.append(newplace)
    with open('data.json', 'w') as outfile:
        json.dump(paths, outfile, indent=2, sort_keys=True)
