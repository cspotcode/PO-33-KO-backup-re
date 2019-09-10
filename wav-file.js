require('source-map-support').install();
const {default: __WaveFile} = require('wavefile');
const WaveFile = /** @type {typeof __WaveFile} */(/** @type {any} */(require('wavefile')));
const fs = require('fs');
const util = require('util');

function main() {
    const [, , inputPath, outputPath] = process.argv;
    const wav = readWavFile(inputPath);
    let i = 0;
    const bitDepth = +wav.bitDepth;
    const {numChannels, chunkSize, sampleRate} = wav.fmt;
    console.dir({bitDepth, numChannels, chunkSize, sampleRate});
    // while(true) {
    //     console.log(wav.getSample(i++));
    // }
}
 
function readWavFile(inputPath) {
    const wavData = fs.readFileSync(inputPath);
    // Load a wav file buffer as a WaveFile object
    let wav = new WaveFile(wavData);
    return wav;
}

function createWavFile(outputPath) {
    const wav = new WaveFile();
    const H = 255;
    const L = 0;
    const sampleCount = 10;
    const channels = 2;
    const channelContents = [H, L];

    const sampleArray = new Proxy([], {
        get(target, index) {
            if(index === 'length') {
                return sampleCount * channels;
            } else {
                const parsed = +/**@type {string} */(index);
                if(!isNaN(parsed)) {
                    return channelContents[parsed % channels];
                } else {
                    throw new Error(`not implemented: getting ${ util.inspect(index) }`);
                }
            }
        }
    });

    wav.fromScratch(2, 96000, '8', sampleArray);
    fs.writeFileSync(outputPath, wav.toBuffer());
}

main();