import { Command } from "../yargs";
import { fs } from "../modules";
import { dataPath, generateNumbers } from "../core";
import { bitSpitter } from "./parse";
import { GlobalArgs } from "../cli";

interface Args extends GlobalArgs {
    sampleRate: number;
    name: string;
}
export const command = Command<Args>({
    command: 'raw-to-bits',
    describe: 'Parse raw to bits',
    builder(yargs) {
        return yargs.options({
            sampleRate: {
                alias: 'r',
                type: 'number',
                demand: true
            },
            name: {
                type: 'string',
                demand: true
            },
        });
    },
    handler(argv) {
        main(argv as any);
    }
});

/**
 * Parse a raw file exported from Audacity.
 * Assumes raw file contains signed 8bit PCM, 48000Hz
 */
function main(opts: {name: string, sampleRate: number}) {
    const {name, sampleRate} = opts;
    const side = 'left';

    console.log(`Opening input and output files`);
    const output = fs.openSync(dataPath(name, `${ side }.${ sampleRate }.bits`), 'w');
    const input = fs.openSync(dataPath(name, `${ side }.${ sampleRate }.s8`), 'r');

    const bitStream = bitSpitter({input: generateNumbers(input), sampleRate});
    console.log(`Iterating bitstream`);
    let lineLength = 0;
    for(const bit of bitStream) {
        fs.writeSync(output, `${bit}`);
        lineLength++;
        if(lineLength === 80) {
            fs.writeSync(output, '\n');
            lineLength = 0;
        }
    }
    console.log(`Closing files`);
    fs.closeSync(input);
    fs.closeSync(output);
}
