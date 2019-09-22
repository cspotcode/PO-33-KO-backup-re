import { Argv, Command } from "../yargs";
import { dataPath } from "../core";
import fs from 'fs';
import { GlobalArgs } from "../cli";

interface Args extends GlobalArgs {
    start: number;
    end: number;
}
export const command = Command<Args>({
    command: 'dump-slice',
    describe: 'extract a slice of backup as CSV',
    builder(yargs) {
        return yargs.options({
            start: {
                type: 'number',
                demand: true
            },
            end: {
                type: 'number',
                demand: true
            }
        });
    },
    handler(argv) {
        const {name, sampleRate, start, end} = argv as any as {sampleRate: number, name: string, output: string, start: number, end: number};
        const countBytes = end - start;
        function readSide(side: 'left' | 'right') {
            const sideRaw = fs.openSync(dataPath(name, `${side}.${sampleRate}.s8`), 'r');
            const b = Buffer.alloc(countBytes);
            fs.readSync(sideRaw, b, 0, countBytes, start);
            fs.closeSync(sideRaw);
            return new Int8Array(b);
        }
        const left = readSide('left');
        const right = readSide('right');
        let acc = '';
        for(let i = 0; i < countBytes; i++) {
            acc += `${left[i]}\t${right[i]}\n`;
        }
        fs.writeFileSync(dataPath(name, `slice.${start}.${end}.tsv`), acc);
    }
});