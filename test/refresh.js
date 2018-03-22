var _ = require('lodash');
var Bom = require('..');
var expect = require('chai').expect;

describe('bom.refresh()', function() {
	var bom;
	before('should setup a BOM instance', ()=> bom = new Bom({id: '032'})); // 032 = Sydney

	it('should fetch radars', function(done) {
		this.timeout(30 * 1000);

		bom.refresh(function(err, res) {
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
