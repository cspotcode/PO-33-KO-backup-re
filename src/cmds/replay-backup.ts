import Speaker, { Options } from '@cspotcode/speaker';
import fs from "fs";
import { numbersToArrayBuffers, arrayBuffersToNodeBuffers, buffersToFile, fileToBuffers, typedArraysToNumbers, buffersToUint8Arrays, generatorShift, generatorMap } from "../generator-utils";
import { Readable } from "stream";
import { dataPath } from "../core";
import { Phase, carrierHz as hz } from '../types-and-constants';
import { Command } from '../yargs';
import { GlobalArgs } from '../cli';
import { FileWriter } from 'wav';

const PI = Math.PI;

interface Args extends GlobalArgs {
    toFile?: boolean;
    toSpeaker?: boolean;
}
export const command = Command<Args>({
    command: 'replay',
    describe: 'Take a parsed backup and replay it by re-generating the audio.',
    builder(yargs) {
        yargs.options({
            toFile: {
                describe: 'Emit reconstituted.<sampleRate>.wav',
                type: 'boolean',
                default: true
            },
            toSpeaker: {
                describe: 'Play to the speakers.',
                type: 'boolean'
            }
        });
    },
    handler(args) {
        const {name, sampleRate, toSpeaker} = args;
        let {toFile} = args;
        if(toSpeaker) toFile = false;
        if(toFile) {
            console.error('toFile output is currently BROKEN!');
        }

        const signed = !!toSpeaker;
        const channels = 2 as 1 | 2;
        const bitDepth = 16 as 8 | 16;
        const AB = signed ? (
            bitDepth === 8 ? Int8Array : Int16Array
        ) : (
            bitDepth === 8 ? Uint8Array : Uint16Array
        );
        const amplitude = 1 << (bitDepth - 2);

        const audioGenerator = channels === 2
            ? createInterleavedStream()
            : createChannelStream('left');

        const bias = 1<<(bitDepth - 1);

        const generator = arrayBuffersToNodeBuffers(
            numbersToArrayBuffers(
                signed ? audioGenerator : generatorMap(
                    audioGenerator,
                    n => n + bias // bias to convert signed to unsigned
                ),
                new AB(100)
            )
        );
        const stream = Readable.from(
            generator
        );

        if(toSpeaker) {
            const speaker = new Speaker({
                bitDepth,
                channels,
                sampleRate,
                signed: true
            } as Options);
            stream.pipe(speaker);
        } else if(toFile) {
            const outputFile = new FileWriter(dataPath(name, 'reconstituted.wav'), {
                sampleRate,
                bitDepth,
                channels,
            });
            stream.pipe(outputFile);
        }
        // const output = fs.openSync(dataPath(name, `${side}.reconstituted.${sampleRate}.s16`), 'w');
        // buffersToFile(generator, output);

        function* phasesToAudioSamples(opts: {input: Generator<Phase>, amplitude: number}) {
            const {amplitude, input} = opts;
            const samplesPerCycle = sampleRate / hz;
            const sampleToRadians = 2 * PI / samplesPerCycle;

            let sampleIndex = 0;
            let radiansStart = 0;
            let thisPhase = input.next().value;
            while(true) {
                const nextPhase = input.next().value;
                if(!nextPhase) return;
                while(true) {
                    const radians = sampleIndex * sampleToRadians;
                    if(radians > radiansStart + 2 * PI) break;

                    const mixValue = getEnvelopeValue(radians - radiansStart);
                    const thisPhaseValue = getOscillatorValue(thisPhase, radians);
                    const nextPhaseValue = getOscillatorValue(nextPhase, radians);
                    const sample = mix(mixValue, thisPhaseValue, nextPhaseValue);
                    yield Math.round(sample * amplitude);

                    sampleIndex++;
                }
                radiansStart += 2 * PI;

                thisPhase = nextPhase;
            }

            function getEnvelopeValue(radians: number): number {
                const start = 1.2 * PI;
                const end = 1.8 * PI;
                if(radians < start) {
                    return 0;
                }
                if(radians > end) {
                    return 1;
                }
                return (radians - start) / (end - start);
            }

            function getOscillatorValue(phase: Phase, radians: number) {
                switch(phase) {
                    case 'A':
                        return Math.sin(radians);
                    case 'B':
                        return Math.cos(radians);
                    case 'C':
                        return -Math.sin(radians);
                    case 'D':
                        return -Math.cos(radians);
                    default: throw 'nope';
                }
            }

            function mix(
                /** from 0 (all valueA) to 1 (all valueB) or anywhere in-between */
                mixAmount: number,
                valueA: number,
                valueB: number
            ) {
                return valueA * (1 - mixAmount) + valueB * mixAmount;
            }
        }

        function* createInterleavedStream() {
            const left = createChannelStream('left');
            const right = createChannelStream('right');
            while(true) {
                const l = left.next();
                yield l.done ? 0 : l.value;
                const r = right.next();
                yield r.done ? 0 : r.value;
                if(r.done && l.done) {
                    break;
                }
            }
        }

        function createChannelStream(side: 'left' | 'right'): Generator<number> {
            const inputPhases = fs.openSync(dataPath(name, `${side}.phases`), 'r');
            function *phaseSpitter() {
                for(const item of typedArraysToNumbers(buffersToUint8Arrays(fileToBuffers(inputPhases)))) {
                    const str = String.fromCharCode(item);
                    if('ABCD'.includes(str)) {
                        yield str as Phase;
                    }
                }
            }
            const audioGenerator = phasesToAudioSamples({
                amplitude,
                input: phaseSpitter()
            });
            return audioGenerator;
        }
    }
});
