#!/usr/bin/env ts-node-to
import { yargs, Command } from './yargs';
import {command as parseCommand} from './cmds/parse';
import {command as parseDpskLegacyCommand} from './cmds/parse-dpsk-legacy';
import {command as rawToBitsCommand} from './cmds/raw-to-bits';
import {command as rawToSliceCommand} from './cmds/raw-to-slice';
import {command as replayCommand} from './cmds/replay-backup';
import {command as recordCommand} from './cmds/record-backup';
import { Options, Argv } from './yargs';

function O(o: Options) {
    return o;
}
export const globalOptions = {
    sampleRate: O({
        describe: `
            sampleRate for recording or playback.
            Don\'t use lower than 44100.
            96000 is a nice sample rate if you want the waveform to look pretty.
        `,
        type: 'number',
        default: 44100
    }),
    name: O({
        describe: `name of backup.  Should be the name of a subdirectory of ./data`,
        type: 'string',
        demand: true
    })
};
export interface GlobalArgs extends Argv {
    sampleRate: number;
    name: string;
}

const rootCommand = Command<GlobalArgs>({
    command: '$0',
    describe: 'Parse and replay PO-33 backup audio',
    subCommands: [
        parseCommand,
        parseDpskLegacyCommand,
        rawToBitsCommand,
        rawToSliceCommand,
        replayCommand,
        recordCommand
    ]
});

yargs
    .options(globalOptions)
    .command(rootCommand)
    .completion()
    .strict()
    .parse();
