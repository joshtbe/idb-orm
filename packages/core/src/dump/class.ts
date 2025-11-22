import { Dict } from "../util-types";

abstract class Dump<T> {
    constructor(
        protected readonly name: string,
        protected readonly content: T,
        protected readonly extension: string
    ) {}

    abstract getValue(): T;
    abstract toFile(filename?: string, options?: FilePropertyBag): File;

    download(
        filename: string = `${this.name}_dump.${this.extension}`,
        options?: FilePropertyBag
    ): void {
        const url = URL.createObjectURL(this.toFile(filename, options));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

export class JsonDump extends Dump<Record<string, unknown>> {
    constructor(name: string, content: Dict) {
        super(name, content, "json");
    }

    getValue(): Record<string, unknown> {
        return this.content as Dict;
    }
    toFile(
        filename: string = `${this.name}_dump.json`,
        options: FilePropertyBag = {}
    ) {
        return new File(
            [JSON.stringify(this.content, undefined, 4)],
            filename,
            options
        );
    }
}

export class CsvDump extends Dump<string> {
    constructor(name: string, content: string) {
        super(name, content, "csv");
    }

    getValue(): string {
        return this.content;
    }

    toFile(
        filename: string = `${this.name}_dump.csv`,
        options?: FilePropertyBag
    ): File {
        return new File([this.content], filename, options);
    }
}
