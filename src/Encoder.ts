function replacer(key, value) {
    const originalObject = this[key];
    if (originalObject instanceof Map) {
        return {
            __dataType: 'Map',
            value: Array.from(originalObject.entries()), // or with spread: value: [...originalObject]
        };
    }

    if (originalObject instanceof Set) {
        return {
            __dataType: 'Set',
            value: Array.from(originalObject.values()), // or with spread: value: [...originalObject]
        };
    }

    return value
}


function reviver(key, value) {
    if (typeof value === 'object' && value !== null) {
        if (value.__dataType === 'Map') {
            return new Map(value.value);
        }

        if (value.__dataType === 'Set') {
            return new Set(value.value);
        }
    }

    return value;
}

export const Encoder = {
    encode: (data: any) => Buffer.from(JSON.stringify(data, replacer)),
    decode: <T>(data: Buffer | string) => JSON.parse(typeof data == 'string' ? data : data.toString('utf8'), reviver) as T
}