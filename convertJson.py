import json
from pprint import pprint

if __name__ == '__main__':
    with open('static/tour-aotearoa.json') as data_file:
        data = json.load(data_file)
        data = data['AllPaths']['Folder']
        paths = []
        for path in data:
            print path['name']
            if not isinstance(path['Placemark'], list):
                path['Placemark'] = [path['Placemark']]
            for place in path['Placemark']:
                if 'MultiGeometry' in place:
                    points = place['MultiGeometry']['LineString']
                else:
                    points = place['LineString']
                print place['name'], len(points['coordinates'])
                newpoints = []
                for p in points['coordinates'].strip().split(' '):
                    values = p.split(',')
                    newpoints.append({
                        'lat': values[0],
                        'lng': values[1],
                        'alt': values[2]
                    })
                newplace = {
                    'name': place['name'],
                    'points': newpoints
                }
                paths.append(newplace)
    with open('data.json', 'w') as outfile:
        json.dump(paths, outfile, indent=2, sort_keys=True)
