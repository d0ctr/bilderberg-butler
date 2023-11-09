BigInt.prototype.toJSON = function() {
    return this.toString() + 'n';
};