var _ = require('lodash');
var Bom = require('..');
var expect = require('chai').expect;

describe('bom.refresh()', function() {
	var bom;
	before('should setup a BOM instance', ()=> bom = new Bom({id: '032'})); // 032 = Sydney

	it('should fetch radars for syndey', function(done) {
		this.timeout(30 * 1000);

		bom.refresh(function(err, res) {
			if (err) return done(err);

			expect(res).to.be.an.instanceOf(Object);
			expect(res).to.have.property('backgrounds');

			expect(res).to.have.property('frames');
			expect(res.frames).to.have.length.above(5);
			expect(res.frames).to.satisfy(()=> res.frames.every(l => _.isString(l)));

			console.log('GOT', res);

			done();
		});

	});

});
