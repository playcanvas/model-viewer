
// Construct an uncompressed PNG file manually because the canvas API suffers from
// bit loss due to its handling of premultiplied alpha.
// Taken from https://rawgit.com/zholos/js_bitmap/master/bitmap.js
function constructPngUrlManual(data, width, height) {
    var row = function (data, width, y) {
        var result = "\0";
        var r = y * width * 4;
        for (var x = 0; x < width; x++) {
            result += String.fromCharCode(data[r], data[r + 1], data[r + 2], data[r + 3]);
            r += 4;
        }
        return result;
    };

    var rows = function (data, width, height) {
        var result = "";
        for (var y = 0; y < height; y++)
            result += row(data, width, y);
        return result;
    };

    var adler = function (data) {
        var s1 = 1, s2 = 0;
        for (var i = 0; i < data.length; i++) {
            s1 = (s1 + data.charCodeAt(i)) % 65521;
            s2 = (s2 + s1) % 65521;
        }
        return s2 << 16 | s1;
    };

    var hton = function (i) {
        return String.fromCharCode(i >>> 24, i >>> 16 & 255, i >>> 8 & 255, i & 255);
    };

    var deflate = function (data) {
        var compressed = "\x78\x01";
        var i = 0;
        do {
            var block = data.slice(i, i + 65535);
            var len = block.length;
            compressed += String.fromCharCode(
                ((i += block.length) == data.length) << 0,
                len & 255, len >>> 8, ~len & 255, (~len >>> 8) & 255);
            compressed += block;
        } while (i < data.length);
        return compressed + hton(adler(data));
    };

    var crc32 = function (data) {
        var c = ~0;
        for (var i = 0; i < data.length; i++)
            for (var b = data.charCodeAt(i) | 0x100; b != 1; b >>>= 1)
                c = (c >>> 1) ^ ((c ^ b) & 1 ? 0xedb88320 : 0);
        return ~c;
    };

    var chunk = function (type, data) {
        return hton(data.length) + type + data + hton(crc32(type + data));
    };

    var png = "\x89PNG\r\n\x1a\n" +
        chunk("IHDR", hton(width) + hton(height) + "\x08\x06\0\0\0") +
        chunk("IDAT", deflate(rows(data, width, height))) +
        chunk("IEND", "");

    return "data:image/png;base64," + btoa(png);
}

// Construct a PNG URL blob using canvas API. We use ImageBitmap
// with premultiplyAlpha none to circumvent the final image data
// undergoing rounding.
// If that fails, we fall back to writing an uncompressed PNG file
// manually (currently applies to Safari and Firefox)
var constructPngUrl = function (data, width, height, callback) {       // eslint-disable-line no-unused-vars
    createImageBitmap(new ImageData(data, width, height), {
        premultiplyAlpha: 'none'
    })
    .then(function (imageBitmap) {
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        var context = canvas.getContext('bitmaprenderer');
        context.transferFromImageBitmap(imageBitmap);

        callback(canvas.toDataURL("image/png"));
    }, function (reject) {
        console.log(reject);
        callback(constructPngUrlManual(data, width, height));
    })
};

// download the data uri
function download(url, filename) {
    var lnk = document.createElement('a');
    lnk.download = filename;
    lnk.href = url;

    // create a "fake" click-event to trigger the download
    if (document.createEvent) {
        var e = document.createEvent("MouseEvents");
        e.initMouseEvent("click", true, true, window,
                         0, 0, 0, 0, 0, false, false, false,
                         false, 0, null);

        lnk.dispatchEvent(e);
    } else if (lnk.fireEvent) {
        lnk.fireEvent("onclick");
    }
}

// read the pixel data of the given texture face
function readPixels(texture, face) {
    var rt = new pc.RenderTarget({ colorBuffer: texture, depth: false, face: face });
    var data = new Uint8ClampedArray(texture.width * texture.height * 4);
    var device = texture.device;

    device.setFramebuffer(rt._glFrameBuffer);
    device.initRenderTarget(rt);
    device.gl.readPixels(0, 0, texture.width, texture.height, device.gl.RGBA, device.gl.UNSIGNED_BYTE, data);

    rt.destroy();

    return data;
}

class Pixels {
    constructor(width, height, data) {
        this.width = width;
        this.height = height;
        this.data = data || new Uint8ClampedArray(width * height * 4);
    }

    flipY() {
        const w = this.width;
        const h = this.height;
        const d = this.data;
        const tmp = new Uint8ClampedArray(w * 4);
        for (let y = 0; y < h / 2; ++y) {
            let x;
            // copy top line to tmp
            for (x = 0; x < w * 4; ++x) {
                tmp[x] = d[x + y * w * 4];
            }
            d.copyWithin(y * w * 4, (h - y - 1) * w * 4, (h - y) * w * 4);
            // copy tmp to bottom
            for (x = 0; x < w * 4; ++x) {
                d[x + (h - y - 1) * w * 4] = tmp[x];
            }
        }
    }
}

// extract a texture face and level into its own texture
function readCubemapPixels(texture, face, level) {
    const device = texture.device;
    const width = texture.width >> level;
    const height = texture.height >> level;

    const targetTexture = new pc.Texture(device, {
        width: width,
        height: height,
        mipmaps: false,
        format: pc.PIXELFORMAT_R8_G8_B8_A8
    });

    const target = new pc.RenderTarget({
        colorBuffer: targetTexture,
        depth: false
    });

    const extractCubemapPS = `
    vec3 getCubemapDirection(vec2 st, float face) {
        if (face == 0.0) {
            return vec3(1, -st.y, -st.x);
        } else if (face == 1.0) {
            return vec3(-1, -st.y, st.x);
        } else if (face == 2.0) {
            return vec3(st.x, 1, st.y);
        } else if (face == 3.0) {
            return vec3(st.x, -1, -st.y);
        } else if (face == 4.0) {
            return vec3(st.x, -st.y, 1);
        } else {
            return vec3(-st.x, -st.y, -1);
        }
    }

    varying vec2 vUv0;
    uniform vec4 params;
    uniform samplerCube source;

    void main() {
        gl_FragColor = textureLod(source, getCubemapDirection(vUv0 * 2.0 - 1.0, params.x), params.y);
    }
    `;

    const shader = pc.shaderChunks.createShaderFromCode(
        device,
        pc.shaderChunks.fullscreenQuadVS,
        extractCubemapPS
    );

    const sourceUniform = device.scope.resolve("source");
    sourceUniform.setValue(texture);

    const paramsArray = new Float32Array(4);
    paramsArray[0] = face;
    paramsArray[1] = level;
    paramsArray[2] = 0;
    paramsArray[3] = 0;

    const paramsUniform = device.scope.resolve("params");
    paramsUniform.setValue([face, level, 0, 0]);

    pc.drawQuadWithShader(device, target, shader);

    const pixels = new Pixels(width, height);

    device.setFramebuffer(target._glFrameBuffer);
    device.gl.readPixels(0, 0, width, height, device.gl.RGBA, device.gl.UNSIGNED_BYTE, pixels.data);

    target.destroy();
    shader.destroy();
    targetTexture.destroy();

    return pixels;
}

function packPixels(pixelsList) {
    const width = pixelsList.reduce((acc, val) => {
        return acc + val.width;
    }, 0);
    const height = pixelsList.reduce((acc, val) => {
        return Math.max(acc, val.height);
    }, 0);

    const result = new Pixels(width, height);

    let x = 0;
    pixelsList.forEach((pixels) => {
        for (let j = 0; j < pixels.height; ++j) {
            let src = j * pixels.width * 4;
            let dst = x * 4 + j * result.width * 4;
            for (let i = 0; i < pixels.width; ++i) {
                result.data[dst++] = pixels.data[src++];
                result.data[dst++] = pixels.data[src++];
                result.data[dst++] = pixels.data[src++];
                result.data[dst++] = pixels.data[src++];
            }
        }
        x += pixels.width;
    });

    return result;
}

// download the image as png
function downloadTexture(texture, filename, face, level, flipY_) {         // eslint-disable-line no-unused-vars
    let pixels;
    if (texture.cubemap) {
        if (face === undefined || face === null) {
            const pixelList = [];
            [1, 4, 0, 5, 2, 3].forEach((face) => {
                for (let level = 0; level < Math.log2(texture.width); ++level) {
                    pixelList.push(readCubemapPixels(texture, face, level));
                }
            });
            pixels = packPixels(pixelList);
        } else {
            pixels = readCubemapPixels(texture, 0, level);
        }
    } else {
        data = readPixels(texture, face, level);
    }

    if (flipY_) {
        pixels.flipY();
    }

    download(constructPngUrlManual(pixels.data, pixels.width, pixels.height), filename);
}

export default downloadTexture;
