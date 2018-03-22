// COMMAND TO CONVERT TO GIF: convert -delay 50 -loop 0 -draw 'image DstOver 0,0,0,0 background.gif' -dispose background IDR032.T.20180321*.png out.gif

var _ = require('lodash');
var async = require('async-chainable');
var debug = require('debug')('bom');
var events = require('events');
var ftp = require('ftp');
var fs = require('fs');
var fspath = require('path');
var glob = require('glob');
var im = require('imagemagick');
var mkdirp = require('mkdirp');
var os = require('os');

function BomRadar(options) {
	var bom = this;

	/**
	* Settings to use for this BomRadar instance
	* @var Object
	*/
	bom.settings = _.defaults(options, {
		id: '032',
		host: 'ftp.bom.gov.au',
		framePath: '/anon/gen/radar',
		backgroundsPath: '/anon/gen/radar_transparencies',
		cachePath: fspath.join(os.tmpdir(), '/bom-cache'),
		getThreads: 1,
		fetch: {
			frames: true,
			backgrounds: true,
		},
		backgrounds: {
			background: true,
			catchments: false,
			locations: true,
			rail: false,
			range: false,
			riverBasins: false,
			roads: false,
			topography: true,
			waterWays: false,
			wthrDistricts: false,
		},
		clean: {
			olderThan: 60*60*24 * 1000, //= 24 hours
		},
		composite: {
			format: 'gif',
			method: 'path',
			cache: true,
			delay: 50,
			cacheFile: b => `IDR${b.settings.id}.composite.${b.settings.composite.format}`,
			cacheFileExpiry: 60*60*1 * 1000, //= 1 hour
			autoRefresh: true,
			autoClean: true,
			arguments: [ // Any argument functions are evaluated as ({frames,backgrounds,settings})
				// Set the animation delay + loop parameters
				'-delay', b => b.settings.composite.delay,
				'-loop', '0',

				// Add background layers
				b => _(b.backgrounds)
					.pickBy((v, k) =>
						v // Has a value
						&& b.settings.backgrounds[k] // User has enabled the background
					)
					.map((v, k) => [
						'-draw',
						`image DstOver 0,0,0,0 '${b.backgrounds[k]}'`,
					])
					.sortBy(v => /\.background\.png/.test(v) ? `AAA${v}` : v) // Sort main background layer first
					.value(),

				// Clear the foreground for each frame
				'-dispose', 'background',

				// List the animation frames
				b => b.frames,

				// Append the output file
				b => fspath.join(b.settings.cachePath, _.isFunction(b.settings.composite.cacheFile) ? b.settings.composite.cacheFile(b) : b.settings.composite.cacheFile),
			],
		},
	});


	/**
	* Convenience function to quickly set settings
	* @param {string|array} key The settings path to set, dotted or array notation is supported
	* @param {*} value The value to set the setting to
	* @returns {BomRadar} This chainable object
	*/
	bom.set = function(key, value) {
		_.set(bom.settings, key, value);
		return bom;
	};


	/**
	* Attempt to refresh BOM radar data from the FTP site
	* @param {Object} [options] Additional options to use (overrides bom.settings)
	* @param {function} cb Callback to call as (error, {backgrounds, frames})
	* @returns {BomRadar} This chainable object
	*/
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
				if (!settings.fetch.backgrounds) return next(); // All backgrounds disabled - then skip
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
									var [,type] = /^IDR.*\.([a-z]+)\.png$/.exec(i.name) || [];
									if (!type) return false;
									if (!settings.backgrounds[type]) return false; // Dont fetch this type
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


	/**
	* Retrieve the files we have stored locally on disk
	* This operates the same as bom.refresh() but does not connect to the FTP - only using local data
	* @param {Object} [options] Additional options to use (overrides bom.settings)
	* @param {function} cb Callback to call as (error, {backgrounds, frames})
	* @returns {BomRadar} This chainable object
	*/
	bom.cached = function(options, cb) {
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
			// Glob the directory {{{
			.then('files', function(next) {
				glob(fspath.join(settings.cachePath, '*.{gif,png}'), next);
			})
			// }}}
			// Map files into basepaths only {{{
			.then('files', function(next) {
				next(null, this.files.map(f => fspath.basename(f)));
			})
			// }}}
			// Break files into their correct sections {{{
			.then('files', function(next) {
				next(null, {
					frames: this.files
						.filter(f => f.startsWith(`IDR${settings.id}.T.`))
						.filter(f => f.endsWith('.png'))
						.map(f => fspath.join(settings.cachePath, f)),
					backgrounds: _(settings.backgrounds)
						.mapValues((f, k) => _(this.files)
							.filter(f => f.startsWith(`IDR${settings.id}.`))
							.filter(f => f.endsWith('.png'))
							.filter(f => (new RegExp(`^IDR.*${k}\.png$`)).test(f))
							.first()
						)
						.pickBy((v, k) => !!v)
						.mapValues(v => fspath.join(settings.cachePath, v))
						.value(),
				});
			})
			// }}}
			// End {{{
			.end(function(err) {
				if (err) return cb(err);
				cb(null, this.files);
			});
			// }}}

		return bom;
	};


	/**
	* Cleans out older radar images
	* @param {Object} [options] Additional options to use (overrides bom.settings)
	* @param {function} cb Callback to call as (error, {backgrounds, frames})
	* @returns {BomRadar} This chainable object
	*/
	bom.clean = function(options, cb) {
		// Argument mangling {{{
		if (_.isFunction(options)) { // Called as (cb)
			cb = options;
			options = {};
		}
		// }}}

		var settings = _.defaults(options, bom.settings);

		async()
			// Fetch local data {{{
			.then('files', function(next) {
				bom.cached(settings, next);
			})
			// }}}
			// Filter down to files we need to remove {{{
			.then('files', function(next) {
				var expiry = new Date(Date.now() - settings.clean.olderThan);
				next(null, this.files.frames
					.filter(f => bom.utils.nameToDate(f) < expiry)
				);
			})
			// }}}
			// Remove marked files {{{
			.forEach('files', function(next, file) {
				debug('rm', file);
				fs.unlink(file, next);
				next();
			})
			// }}}
			// End {{{
			.end(function(err) {
				if (err) return cb(err);
				cb(null, this.files);
			})
			// }}}

		return bom;
	};


	/**
	* Create a composite image based on the cached data from bom.refresh()
	* This function creates a single GIF / MP4 file which has a background + animated radar layers
	* @param {Object} [options] Additional options to use (overrides bom.settings)
	* @param {function} cb Callback to call as (error, buffer|path|stream)
	* @returns {BomRadar} This chainable object
	*/
	bom.composite = function(options, cb) {
		// Argument mangling {{{
		if (_.isFunction(options)) { // Called as (cb)
			cb = options;
			options = {};
		}
		// }}}

		var settings = _.defaults(options, bom.settings);

		async()
			.set('cacheFile', fspath.join(settings.cachePath, _.isFunction(settings.composite.cacheFile) ? settings.composite.cacheFile({settings}) : settings.composite.cacheFile))
			// Check the cached version hasn't expired (If settings.composite.cache) {{{
			.then(function(next) {
				// Calculate the cache file value
				var cacheFileExpiry = new Date(Date.now() - settings.composite.cacheFileExpiry);

				fs.stat(this.cacheFile, (err, stat) => {
					if (err) {
						debug(`Radar ${settings.id} composite "${this.cacheFile}" does not exist - creating`);
						next(); // No cached radar - continue on to generate it
					} else if (stat.mtime < cacheFileExpiry) {
						debug(`Radar ${settings.id} composite "${this.cacheFile}" expired! - Recreating`);
						next(); // File exists but it has expired
					} else {
						debug(`Radar ${settings.id} composite "${this.cacheFile}" is still within cache range - Using cached version`);
						next('SKIP');
					}
				});
			})
			// }}}
			// Refresh data (if settings.composite.autoRefresh) {{{
			.then(function(next) {
				bom.refresh(settings, next);
			})
			// }}}
			// Clean data (if settings.composite.autoClean) {{{
			.then(function(next) {
				bom.clean(settings, next);
			})
			// }}}
			// Fetch cached file list {{{
			.then('files', function(next) {
				bom.cached(next);
			})
			// }}}
			// Compute ImageMagick arguments {{{
			.then('arguments', function(next) {
				next(null,
					_(settings.composite.arguments)
						.map(a =>
							_.isFunction(a) ? a({
								settings,
								...this.files,
							})
							: a
						)
						.flattenDeep()
						.value()
				);
			})
			// }}}
			// Run ImageMagick {{{
			.then(function(next) {
				if (debug.enabled) {
					debug('ImageMagic> Run as -',
						'convert '
						+ this.arguments
							.map(a => / /.test(a) ? `"${a}"` : a)
							.join(' ')
					);
				}
				im.convert(this.arguments, next);
			})
			// }}}
			// End {{{
			.end(function(err) {
				if (err && err != 'SKIP') {
					cb(err);
				} else if (settings.composite.method == 'path') {
					cb(null, this.cacheFile);
				} else if (settings.composite.method == 'buffer') {
					fs.readFile(this.cacheFile, cb);
				} else if (settings.composite.method == 'stream') {
					cb(null, fs.createReadStream(this.cacheFile));
				} else {
					cb(`Unknown composite return method: "${settings.composite.method}"`);
				}
			})
			// }}}

		return bom;
	};


	/**
	* General utilities storage for this module
	* @var Object
	*/
	bom.utils = {};


	/**
	* Utility function to convert a BOM filename to a JavaScript Date object
	* @param {string} path The file path to translate (basename will be computed automatically)
	* @returns {Date|null} Either a JavaScript date if one could be extracted or null
	*/
	bom.utils.nameToDate = function(path) {
		var name = fspath.basename(path);
		//                                         ID...  YEAR      MONTH     DAY       Hour (24) Minute
		//                                         IDR... 2018      03        21        05        00        .png
		var [, year, month, day, hour, minute] = /^IDR.+\.([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})\./.exec(name) || [];
		return (
			year
			? new Date(year, month - 1, day, hour, minute)
			: null
		);
	};

	return bom;
};

module.exports = BomRadar;
