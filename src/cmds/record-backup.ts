import { GlobalArgs } from "../cli";
import { Command } from "../yargs";
import { fs } from "../modules";
import { dataPath } from "../core";
/// <reference path="../types/mic.d.ts" />
/// <reference path="../types/wav.d.ts" />
import mic from 'mic';
import wav from 'wav';

interface Args extends GlobalArgs {

}
export const command = Command<Args>({
    command: 'record',
    handler(args) {
        const {name, sampleRate} = args;
        fs.mkdirpSync(dataPath(name));

        const bitDepth = 16;

        const micInstance = mic({
            rate: `${ sampleRate }`,
            channels: '2',
            exitOnSilence: 20,
            debug: true,
            bitwidth: `${ bitDepth }`,
        });

        const outputFile = new wav.FileWriter(dataPath(name, 'backup.wav'), {
            sampleRate,
            bitDepth,
            channels: 2
        });

        micInstance.start();

        const audio = micInstance.getAudioStream();
        // audio.on('data', d => {
        //     console.dir(d);
        // });
        audio.on('silence', () => {
            micInstance.stop();
        });

        micInstance.getAudioStream().pipe(outputFile);

        console.log('Recording...');
    }
});