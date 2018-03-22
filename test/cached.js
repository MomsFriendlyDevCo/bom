var _ = require('lodash');
var Bom = require('..');
var expect = require('chai').expect;

describe('bom.cached()', function() {
	var bom;
	before('should setup a BOM instance', ()=> bom = new Bom({id: '032'})); // 032 = Sydney

	it('should fetch cached data', function(done) {
		this.timeout(30 * 1000);

		bom.cached(function(err, res) {
			if (err) return done(err);

			expect(res).to.be.an.instanceOf(Object);
			expect(res).to.have.property('backgrounds');
			expect(res.backgrounds).to.be.an.instanceOf(Object);
			expect(res.backgrounds).to.satisfy(i => _.values(i).every(l => _.isString(l)));

			expect(res).to.have.property('frames');
			expect(res.frames).to.have.length.above(5);
			expect(res.frames).to.satisfy(i => i.every(l => _.isString(l)));

			done();
		});

	});
});