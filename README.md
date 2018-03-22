@momsfriendlydevco/bom
======================
Tools to pull in, manipulate and cache Australian Bureau of Meteorology (BOM) [Weather Radars](http://www.bom.gov.au/products/IDR663.loop.shtml#skip).


Retrieving your local area ID.
------------------------------
Go to the [BOM website](http://www.bom.gov.au/catalogue/anon-ftp.shtml) and type in the approximate area name. The code will be listed to the left. For example "Wollongong" mid-range radar has the code `IDR032` so supply the ID `032` to retrieve data from this radar.


Example
-------
Create an animated Radar image for the Radar over Sydney:

```javascript
var Bom = require('@momsfriendlydevco/bom');

new Bom()
	.set('id', '032')
	.set('composite.format', 'mp4')
	.composite(function(err, path) {
		console.log('MP4 video created at:', path);
	})
```


Debugging
---------
This module uses the [Debug NPM](https://github.com/visionmedia/debug) to output debugging information to the console. Simply set `DEBUG=bom` when running whatever upstream library this module is contained in to see debugging information.


API
===

BOM (class)
-----------
The main class instance.

Construct this with optional settings to initialize.

```javascript
var bom = new Bom({id: '032'}); // Sydney
```


bom.settings (object)
---------------------
Object used to store all settings for this instance. These can be set during the constructor, via calls to `set(key, val)` or directly in this object.

Supported settings:

| Setting                     | Type    | Default                                            | Description                                                                                   |
|-----------------------------|---------|----------------------------------------------------|-----------------------------------------------------------------------------------------------|
| `id`                        | Number  | `032`                                              | The ID of the weather radar to use (see the README file for how to retrieve this              |
| `host`                      | String  | `"ftp.bom.gov.au"`                                 | The FTP host to communicate with to retrieve data                                             |
| `framePath`                 | String  | `"/anon/gen/radar"`                                | The path on the FTP host where the radar frames are located                                   |
| `backgroundsPath`           | String  | `"/anon/gen/radar_transparencies"`                 | The path on the FTP host where the background layers are located                              |
| `cachePath`                 | String  | `"${os.tmpdir()}/bom-cache"`                       | Where to locally store cached resources                                                       |
| `getThreads`                | Number  | `1`                                                | How many FTP GET operations to support at once                                                |
| `fetch`                     | Object  | See below                                          | Options for fetching data during a call to `refresh()`                                        |
| `fetch.frames`              | Boolean | `true`                                             | Whether to attempt to refresh frame data                                                      |
| `fetch.backgrounds`         | Boolean | `true`                                             | Whether to attempt to refresh background layer data                                           |
| `backgrounds`               | Object  | `{background:true,locations:true,topography:true}` | An object specifying which background layers to fetch / render                                |
| `clean`                     | Object  | See below                                          | Options for cleaning resources                                                                |
| `clean.olderThan`           | Number  | `60*60*24*1000` (24 hours)                         | The time (in milliseconds) from now which is used to expire resources                         |
| `composite`                 | Object  | See below                                          | Options for compositing an animated Radar file via `composite()`                              |
| `composite.autoRefresh`     | Boolean | `true`                                             | Automatically try to refresh data, disable this if you are calling this manulally             |
| `composite.autoClean`       | Boolean | `true`                                             | Automatically try to clean out expired radar images, disable if you are calling this manually |
| `composite.cache`           | Boolean | `true`                                             | Attempt to provide the composite radar animation from a local resource instead of generating  |
| `composite.cacheFile`       | Function or String  | `IDR{CODE}.composite.{EXT}`            | How to calculate the cache file name                                                          |
| `composite.cacheFileExpiry` | Number  | `60*60*100` (1 hour)                               | How long the cached version of the composite should be allowed before expiry                  |
| `composite.format`          | String  | `gif`                                              | An [ImageMagick](https://www.imagemagick.org) compatible multi-image file format to render    |
| `composite.method`          | String  | `"path"`                                           | What to actually return from `composite()`. Can be `"path", "buffer", "stream"`               |
| `composite.delay`           | Number  | `50`                                               | Default delay (in milliseconds) between frames when compositing                               |
| `composite.arguments`       | Array   | Complex, see source code                           | The operations to perform via ImageMagick to output the composite file                        |



bom.set(key, value)
-------------------
Convenience function to quickly set an option.
Dotted or array notation are both supported.

```javascript
bom
	.set('fetch.frames', true)
	.set(['composite', 'format'], 'mp4')
	.composite(()=> ...)
```


bom.refresh([options], callback)
--------------------------------
Attempt to refresh BOM radar data from the FTP site.

The callback will be called as `(err, {backgrounds, frames})`.


bom.cached([options], callback)
-------------------------------
Retrieve the files we have stored locally on disk.
This operates the same as bom.refresh() and has the same return but does not connect to the FTP - only using local data.


bom.clean([options], callback)
------------------------------
Cleans out older radar images.

The callback is called as `(err, arrayOfImagesRemoved)`.


bom.composite([options], callback)
----------------------------------
Create a composite image based on the cached data from bom.refresh()
This function creates a single GIF / MP4 / Any multi-image file which has a background + animated radar layers.

You can see a list of compatible multi-image files by running `convert -list format` and searching for any format with '+' in its Mode flags.

The callback is called as `(err, output)` where output is the format requested in `bom.settings.composite.method` which can be `"path"` (default), `"buffer"` or `"stream"`.


bom.utils.nameToDate(path)
--------------------------
Translate a BOM filename into a JavaScript Date.
