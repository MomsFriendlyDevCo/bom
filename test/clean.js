var _ = require('lodash');
var Bom = require('..');
var expect = require('chai').expect;

describe('bom.clean()', function() {
	var bom;
	before('should setup a BOM instance', ()=> bom = new Bom({id: '032'})); // 032 = Sydney

	it('should clean old data', function(done) {
		this.timeout(30 * 1000);

		bom.clean(function(err, res) {
			if (err) return done(err);

			expect(res).to.be.an.instanceOf(Array);

			done();
		});

	});
});
