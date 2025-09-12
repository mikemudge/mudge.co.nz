/**
 * @class Parser to parse DAH JSON structures
 * @constructor
 */
EightI.DAHParser = function(url) {
    this.maxVersion = 0.3;
    this.url = url;
    this.dah = null;
};

EightI.DAHParser.prototype = {

    /**
     * Parse the dah at the specified url, <tt>onLoaded</tt> will be called once parsed
     */
    parse: function() {
        var xml = new XMLHttpRequest();
        xml.open("GET", this.url, true);
        xml.onload = function () {
            if (xml.status == 200) {
                this.dah = JSON.parse(xml.responseText);
                if(this.loaded() && this.onLoaded) {
                    this.onLoaded();
                }
            }
        }.bind(this);
        xml.send(null);
    },
    /**
     * Get the DAH version
     * @returns {number}
     */
    version: function() {
        if(this.dah) {
            return parseFloat(this.dah.version);
        }
    },

    /**
     * Check if the DAH has finished loading
     * @returns {boolean}
     */
    loaded: function() { return this.dah != null && this.version() >= this.maxVersion;  },


    /**
     * Called when the dah has been parsed
     * @function
     */
    onLoaded: undefined,

    /**
     * Get the total duration of the dah
     * @returns {number}
     */
    getDuration: function() {
        var result = 0.0;
        if(this.loaded()) {
            result = this.dah.duration;
        }
        return result;
    },

    /**
     * Get the number of clips this dah contains
     * @returns {number}
     */
    numClips: function() {
        var clips = 0;
        if(this.loaded()) {
            clips = this.dah.clips.length;
        }
        return clips;
    },

    /**
     * Get the duration of the specified clip
     * @param {number} clipIdx
     * @returns {number}
     */
    getClipDuration: function(clipIdx) {
        var result = 0.0;
        if(clipIdx < this.numClips()) {
            result = this.dah.clips[clipIdx].duration;
        }
        return result;
    },

    /**
     * Check if the specified clip has the specidied content set
     * @param {number} clipIdx
     * @param {string} contentSet
     * @returns {boolean}
     */
    hasContentSet: function(clipIdx, contentSet) {
        var result = false;
        if(clipIdx < this.numClips()) {
            var clip = this.dah.clips[clipIdx];
            for(var i = 0; i < clip.content_sets.length; ++i) {
                if(clip.content_sets[i].type === contentSet) {
                    result = true;
                    break;
                }
            }
        }
        return result;
    },

    /**
     * Get the number of representations for the specified clip and content set
     * @param {number} clipIdx
     * @param {string} contentSet
     * @returns {number}
     */
    numRepresentations: function(clipIdx, contentSet) {
        var result = 0;
        if(clipIdx < this.numClips()) {
            var clip = this.dah.clips[clipIdx];
            for(var i = 0; i < clip.content_sets.length; ++i) {
                if(clip.content_sets[i].type === contentSet) {
                    result = clip.content_sets[i].representations.length;
                    break;
                }
            }
        }
        return result;
    },

    /**
     * Get the specified representation from the dah
     * @param clipIdx
     * @param contentSetType
     * @param representationIdx
     * @returns {{url: string, framerate: number}}
     */
    getRepresentation: function(clipIdx, contentSetType, representationIdx) {
        if (clipIdx < this.numClips()) {
            var clip = this.dah.clips[clipIdx];
            for (var cs = 0; cs < clip.content_sets.length; ++cs) {
                var content_set = clip.content_sets[cs];
                if (content_set.type == contentSetType) {
                    if(representationIdx < content_set.representations.length) {
                        var representation = content_set.representations[representationIdx];
                        var rep_url = representation.url;
                        if (this.dah.base_url) {
                            // Prepend the base url if it exists.
                            rep_url = this.dah.base_url + '/' + rep_url;
                        }
                        return {
                            url: rep_url,
                            params: representation.params
                        };

                    }
                    break;
                }
            }
        }
        return null;
    },
    /**
     * Get the transformation matrix from the dah
     * @returns {THREE.Matrix4}
     */
    getTransformationMatrix: function() {
        var matrix = new THREE.Matrix4();
        if(this.loaded() && this.dah.hasOwnProperty('settings')){
            var settings = this.dah.settings;
            var translation = new THREE.Vector3();
            if(settings.hasOwnProperty('translation')) {
                var t = settings.translation;
                translation.set(t[0], t[1], t[2])
            }
            var rotation = new THREE.Quaternion();
            if(settings.hasOwnProperty('rotation')) {
                var r = settings.rotation;
                rotation.setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'XYZ'));
            }
            var scale = new THREE.Vector3();
            if(settings.hasOwnProperty('scale')) {
                var s = settings.scale;
                scale.set(s[0], s[1], s[2]);
            }

            matrix.compose(translation, rotation, scale);
        }
        return matrix;
    }
};
