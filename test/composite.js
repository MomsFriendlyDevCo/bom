var _ = require('lodash');
var Bom = require('..');
var expect = require('chai').expect;
var fs = require('fs');

describe('bom.composite()', function() {
	var bom;
	before('should setup a BOM instance', ()=> bom = new Bom(require('./config')));

	it('should fetch radars to a file path', function(done) {
		this.timeout(30 * 1000);

		bom
			.set('composite.method', 'path')
			.composite(function(err, res) {
				if (err) return done(err);

				expect(res).to.be.ok;
				expect(res).to.match(/\/IDR.+\.gif$/);

				done();
			});
	});

	it('should fetch radars to a buffer', function(done) {
		this.timeout(30 * 1000);

		bom
			.set('composite.method', 'buffer')
			.composite(function(err, res) {
				if (err) return done(err);

				expect(res).to.be.ok;
				expect(res).to.be.an.instanceOf(Buffer);

				done();
			});
	});

	it('should fetch radars to a stream', function(done) {
		this.timeout(30 * 1000);

		bom
			.set('composite.method', 'stream')
			.composite(function(err, res) {
				if (err) return done(err);

				expect(res).to.be.ok;
				expect(res).to.be.an.instanceOf(fs.ReadStream);

				done();
			});
	});


	// Change 'skip' to 'only' in the next test to dump the file to disk for inspection
	it.skip('should render to a file for inspection', function(done) {
		this.timeout(30 * 1000);

		bom
			.set('composite.cache', false) // Force refreshing (useful if you're playing around with any of the composite settings)
			.set('composite.method', 'stream')
			.set('composite.removeAttribution', true) // Test attribution removal
			.composite(function(err, res) {
				if (err) return done(err);

				res.pipe(fs.createWriteStream('./output.gif'))
					.on('close', ()=> {
						console.log('Output image as "./output.gif"');
						done();
					});
			});
	})
});
