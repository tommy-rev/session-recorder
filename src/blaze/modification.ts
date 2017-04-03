import { PrimitiveValue } from './node';

export enum ModificationType {
    SetValue = 'setValue' as any,
    SetValues = 'setValues' as any,
    Update = 'updateChildValues' as any,
    Remove = 'remove' as any
}

export interface Modification {
    path: string;
    type: ModificationType;
}

export enum ModificationSource {
    Local,
    Remote
}

export interface AttributedModification {
    modification: Modification;
    source: ModificationSource;
}

export interface SetValue extends Modification {
    value: PrimitiveValue;
}

export interface SetValues extends Modification {
    values: { [key: string]: PrimitiveValue };
}

export interface Update extends Modification {
    values: { [key: string]: PrimitiveValue };
}

export interface Remove extends Modification {}

export class ModificationFactory {
    static SetValue(path: string, value: PrimitiveValue): SetValue {
        return {
            path,
            type: ModificationType.SetValue,
            value
        };
    }

    static SetValues(path: string, values: { [key: string]: PrimitiveValue }): SetValues {
        return {
            path,
            type: ModificationType.SetValues,
            values
        };
    }

    static Update(path: string, values: { [key: string]: PrimitiveValue }): Update {
        return {
            path,
            type: ModificationType.Update,
            values
        };
    }

    static Remove(path: string): Remove {
        return {
            path,
            type: ModificationType.Remove
        };
    }
}
