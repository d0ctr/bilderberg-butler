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
    "docdash": {
        "sectionOrder": [
            "Modules",
            "Namespaces",
            "Interfaces",
            "Classes",
            "Externals",
            "Events",
            "Mixins",
            "Tutorials",
        ],
        "typedefs": true
    }
};

BigInt.prototype.toJSON = function() {
    return this.toString() + 'n';
};