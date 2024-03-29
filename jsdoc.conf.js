module.exports = {
    "source": {
        "include": ".",
        "excludePattern": ".*node_modules.*"
    },
    "sourceType": "script",
    "plugins": [
        "plugins/markdown"
    ],
    "opts": {
        "recurse": true,
        "destination": "./jsdoc/",
        "template": "node_modules/docdash"
    },
    "templates": {
        "default": {
            "outputSourceFiles": true,
            "includeDate": false,
            "useLongnameInNav": true
        }
    },
    "tags": {
        "allowUnknownTags": true,
    },
    "docdash": {
        "sectionOrder": [
            "Modules",
            "Namespaces",
            "Interfaces",
            "Classes",
            "Global",
            "Externals",
            "Events",
            "Mixins",
            "Tutorials",
        ],
        "navLevel": 0,
        "typedefs": true,
        "collapse": true,
    }
};

BigInt.prototype.toJSON = function() {
    return this.toString() + 'n';
};