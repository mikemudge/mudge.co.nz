import urllib2

from math import radians, cos, sin, asin, sqrt
from sys import argv, exit
from datetime import datetime, date, timedelta
from hashlib import md5

# https://stackoverflow.com/questions/4913349/haversine-formula-in-python-bearing-and-distance-between-two-gps-points/4913653#4913653
def haversine(lon1, lat1, lon2, lat2):
    """
    Calculate the great circle distance between two points
    on the earth (specified in decimal degrees)
    """
    # convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])

    # haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
    c = 2 * asin(sqrt(a))
    r = 6371  # Radius of earth in kilometers. Use 3956 for miles
    return c * r

def loadDowJones():
    # TODO figure out the params.
    lines = urllib2.urlopen("https://ichart.yahoo.com/table.csv?s=%5EDJI&a=00&b=1&c=2015&d=$mon&e=$dat&f=$year&g=d&ignore=.csv").readlines()
    lines = lines[1:]
    lines = [l.strip('\n') for l in lines]

    dj = {}
    for l in lines:
        values = l.split(',')
        dat = values[0]
        dowjones = values[1]

        # convert the date string to a "date" object
        dat = datetime.strptime(dat, '%Y-%m-%d').date()
        # round the DowJones
        dowjones = round(float(dowjones), 2)
        dj[dat] = dowjones
    return dj

def daterange(start_date, end_date):
    for n in range(int((end_date - start_date).days)):
        yield start_date + timedelta(n)

def nearest(lat, lon, fractionLat, fractionLon):
    # Remove the decimal.
    latPrefix = int(lat)
    lonPrefix = int(lon)

    minimalDistance = float("inf")  # infinity is larger than everything else!
    # calculate the minimum distance to all of the 9 adjacent graticules geohashes
    for i in range(-1, 2):  # i is in -1 0 1
        for j in range(-1, 2):  # j is in -1 0 1
            lat2 = latPrefix + i
            lon2 = lonPrefix + j
            # conditionally add or subtract because -1 + .123 != -1.123 like we want.
            if (lat2 < 0):
                lat2 -= fractionLat
            else:
                lat2 += fractionLat
            if (lon2 < 0):
                lon2 -= fractionLon
            else:
                lon2 += fractionLon
            dis = haversine(lat, lon, lat2, lon2)
            minimalDistance = min(minimalDistance, dis)
    return minimalDistance

def calculateFractions(dj, lat, lon):
    results = []
    for d in (daterange(date(2016, 1, 1), date.today())):
        significantDJdate = d
        # if we are east of 30W and the date is after or equal to
        # 2008-05-27 when the 30W rule was introduced
        # -> use the previous day!
        if lon > -30 and d >= date(2008, 5, 27):
            significantDJdate -= timedelta(days=1)
        # go back up to 3 days(long weekends), until we have a DJ value!
        if significantDJdate not in dj:
            significantDJdate -= timedelta(days=1)
        if significantDJdate not in dj:
            significantDJdate -= timedelta(days=1)
        if significantDJdate not in dj:
            significantDJdate -= timedelta(days=1)
        if significantDJdate not in dj:
            print significantDJdate, 'not available'
            continue

        s = "%s-%.2f" % (d, dj[significantDJdate])
        md5Output = md5(s.encode('ascii')).digest()
        fractionA = float(long(md5Output[0:8].encode('hex'), 16)) / (256**8)
        fractionB = float(long(md5Output[8:16].encode('hex'), 16)) / (256**8)
        # fractionA = struct.unpack(">L", md5Output[4:8])[0] / (256**8)
        # fractionB = struct.unpack(">L", md5Output[12:16])[0] / (256**8)
        # fractionA = int.from_bytes(md5Output[0:8], byteorder='big', signed=False) / (256**8)
        # fractionB = int.from_bytes(md5Output[8:16], byteorder='big', signed=False) / (256**8)
        # distance = nearest(lat, lon, fractionA, fractionB)
        # I'm not 100% sure about these distances?
        # print("%s km near normal hash, hash(%s), fractions: %f, %f" % (distance, s, fractionA, fractionB))
        result = {
            'date': str(d),
            'hash': s
        }
        if lat < 0:
            result['lat'] = lat - fractionA
        else:
            result['lat'] = lat + fractionA
        if lon < 0:
            result['lon'] = lon - fractionB
        else:
            result['lon'] = lon + fractionB
        results.append(result)
        # now calculate the global hash
        # for the globalhash, we always use the previous day!
        # significantDJdate = d - timedelta(days=1)
        # go back, until we have a DJ value!
        # while significantDJdate not in dj:
        #     significantDJdate -= timedelta(days=1)
        # s = "%s-%.2f" % (d, dj[significantDJdate])
        # md5Output = md5(s.encode('ascii')).digest()
        # globalLat = int.from_bytes(md5Output[0:8],  byteorder='big', signed=False) / (256**8) * 180 - 90
        # globalLon = int.from_bytes(md5Output[8:16], byteorder='big', signed=False) / (256**8) * 360 - 180
        # distance = haversine(lat, lon, globalLat, globalLon)
        # print("%s km near global hash, hash(%s), coordinates: %f, %f" % (distance, s, globalLat, globalLon))

    return results

if __name__ == "__main__":
    if len(argv) != 3:
        print("usage: %s <lat> <lon>" % argv[0])
        exit(1)
    dj = loadDowJones()
    calculateFractions(dj, float(argv[1]), float(argv[2]))
