import __yargs, { CommandModule, Arguments, Options } from 'yargs';
const yargs = require('yargs') as typeof __yargs;

export {yargs, Options};

export type Yargs<T> = __yargs.Argv<T>;

export interface Argv extends Pick<Arguments, '_' | '$0'> {}

export interface Command<Args extends Argv> extends Omit<CommandModule<Args>, 'handler' | 'builder'> {
    subCommands?: ReadonlyArray<CommandModule<any>>;
    builder?: (yargs: Yargs<Args>) => void;
    handler?: (args: Args) => void | Promise<void>;
}
export function Command<Args extends Argv>(cmd: Command<Args>) {
    return {
        ...cmd,
        builder(yargs: Yargs<any>) {
            cmd.builder && cmd.builder(yargs);
            if(!cmd.handler) yargs.demandCommand();
            if(cmd.subCommands) {
                for(const subCommand of cmd.subCommands) {
                    yargs.command(subCommand);
                }
            }
            return yargs;
        }
    } as CommandModule<any, any>;
}
