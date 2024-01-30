module.exports = {
    "source": {
        "include": [
            "./api", 
            "./commands",
            "./discord",
            "./services",
            "./telegram"
        ]
    },
    "sourceType": "script",
    "plugins": [
        "plugins/markdown"
    ],
    "opts": {
        "recursive": true,
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