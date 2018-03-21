// COMMAND TO CONVERT TO GIF: convert -delay 50 -loop 0 -draw 'image DstOver 0,0,0,0 background.gif' -dispose background IDR032.T.20180321*.png out.gif

var _ = require('lodash');
var async = require('async-chainable');
var debug = require('debug')('bom');
var events = require('events');
var ftp = require('ftp');
var fs = require('fs');
var fspath = require('path');
var mkdirp = require('mkdirp');
var os = require('os');

function BomRadar(options) {
	var bom = this;

	bom.settings = _.defaults(options, {
		id: '032',
		host: 'ftp.bom.gov.au',
		framePath: '/anon/gen/radar',
		backgroundsPath: '/anon/gen/radar_transparencies',
		cachePath: fspath.join(os.tmpdir(), '/bom-cache'),
		getThreads: 1,
		fetch: {
			frames: true,
			backgrounds: {
				background: true,
				catchments: false,
				locations: true,
				rail: true,
				range: false,
				riverBasins: false,
				roads: false,
				topography: true,
				waterWays: false,
				wthrDistricts: false,
			},
		},
	});

	bom.refresh = function(options, cb) {
		// Argument mangling {{{
		if (_.isFunction(options)) { // Called as (cb)
			cb = options;
			options = {};
		}
		// }}}

		var settings = _.defaults(options, bom.settings);

		async()
			// Ensure cache directory exists {{{
			.then(function(next) {
				mkdirp(settings.cachePath, next);
			})
			// }}}
			// Connect {{{
			.then('client', function(next) {
				debug('FTP> Connecting...');
				var ftpClient = new ftp()
					.on('ready', ()=> next(null, ftpClient));

				ftpClient.connect({host: settings.host}, next)
			})
			// }}}
			// Fetch backgrounds {{{
			.then('backgrounds', function(next) {
				if (!_.values(settings.fetch.backgrounds).some(i => i)) return next(); // All backgrounds disabled - then skip
				async()
					.set('client', this.client)
					// Change directory {{{
					.then(function(next) {
						debug('FTP (backgrounds)> cd', settings.backgroundsPath);
						this.client.cwd(settings.backgroundsPath, next);
					})
					// }}}
					// List files {{{
					.then('files', function(next) {
						debug('FTP (backgrounds)> ls');
						this.client.list(next);
					})
					// }}}
					// Filter background images into the ones we want {{{
					.then('files', function(next) {
						next(null,
							this.files
								.filter(i => i.name.startsWith(`IDR${settings.id}`))
								.filter(i => i.name.endsWith('.png'))
								.filter(i => {
									var bits = /^IDR.*\.([a-z]+)\.png$/.exec(i.name);
									if (!bits) return false; // Doesn't match expected format
									var type = bits[1];

									if (!type) return false;
									if (!settings.fetch.backgrounds[type]) return false; // Dont fetch this type
									return true;
								})
						);
					})
					// }}}
					// Grab background images as async {{{
					.limit(settings.getThreads)
					.forEach('files', function(next, file) {
						file.cachePath = fspath.join(settings.cachePath, file.name);

						async()
							.set('client', this.client)
							// Lookup size of existing file (if any) {{{
							.then('stat', function(next) {
								fs.stat(file.cachePath, function(err, stat) {
									if (err) {
										return next(); // No file - continue to grab it
									} else if (stat && stat.size == file.size) { // Found file and the size matches
										debug('FTP (backgrounds)> # skip', file.name);
										return next('SKIP');
									} else { // Everything else - grab the file
										return next();
									}
								});
							})
							// }}}
							// Grab the file {{{
							.then(function(next) {
								debug('FTP (backgrounds)> get', file.name, '->', file.cachePath);
								this.client.get(file.name, function(err, getStream) {
									getStream
										.pipe(fs.createWriteStream(file.cachePath))
										.on('close', ()=> next())
								});
							})
							// }}}
							// End {{{
							.end(function(err) {
								if (err && err == 'SKIP') { // Ignore skips
									return next();
								} else {
									next(err);
								}
							})
							// }}}

					})
					.end(function(err) {
						if (err) return next(err);
						next(null, this.files.map(f => f.cachePath));
					});
			})
			// }}}
			// }}}
			// Fetch frames {{{
			.then('frames', function(next) {
				if (!settings.fetch.frames) return next();

				async()
					.set('client', this.client)
					// Change directory {{{
					.then(function(next) {
						debug('FTP (frames)> cd', settings.framePath);
						this.client.cwd(settings.framePath, next);
					})
					// }}}
					// List files {{{
					.then('files', function(next) {
						debug('FTP (frames)> ls');
						this.client.list(next);
					})
					// }}}
					// Filter radar images into the ones we want {{{
					.then('files', function(next) {
						next(null,
							this.files
								.filter(i => i.name.startsWith(`IDR${settings.id}`))
								.filter(i => i.name.endsWith('.png'))
						);
					})
					// }}}
					// Grab radar images as async {{{
					.limit(settings.getThreads)
					.forEach('files', function(next, file) {
						file.cachePath = fspath.join(settings.cachePath, file.name);

						async()
							.set('client', this.client)
							// Lookup size of existing file (if any) {{{
							.then('stat', function(next) {
								fs.stat(file.cachePath, function(err, stat) {
									if (err) {
										return next(); // No file - continue to grab it
									} else if (stat && stat.size == file.size) { // Found file and the size matches
										debug('FTP (frames)> # skip', file.name);
										return next('SKIP');
									} else { // Everything else - grab the file
										return next();
									}
								});
							})
							// }}}
							// Grab the file {{{
							.then(function(next) {
								debug('FTP (frames)> get', file.name, '->', file.cachePath);
								this.client.get(file.name, function(err, getStream) {
									getStream
										.pipe(fs.createWriteStream(file.cachePath))
										.on('close', ()=> next())
								});
							})
							// }}}
							// End {{{
							.end(function(err) {
								if (err && err == 'SKIP') { // Ignore skips
									return next();
								} else {
									next(err);
								}
							})
							// }}}

					})
					.end(function(err) {
						if (err) return next(err);
						next(null, this.files.map(f => f.cachePath));
					});
			})
			// }}}
			// }}}
			// Close the FTP connection {{{
			.then(function(next) {
				debug('FTP> exit');
				this.client.end();
				next();
			})
			// }}}
			// End {{{
			.end(function(err) {
				if (err) return cb(err);

				cb(null, {
					backgrounds: this.backgrounds,
					frames: this.frames,
				});
			})
			// }}}

		return bom;
	};

	return bom;
};

module.exports = BomRadar;
