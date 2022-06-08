import { Subject } from "rxjs";
import { mergeMap } from 'rxjs/operators'

export class Queue {

    #subject = new Subject<{ fn: Function, s: Function, r: Function }>()

    constructor(concurrency?: number) {
        this.#subject.pipe(
            mergeMap(async ({ fn, r, s }) => {
                try {
                    s(await fn())
                } catch (e) {
                    r(e)
                }
            }, concurrency)
        ).subscribe()
    }

    async add(fn: Function) {
        return await new Promise(
            (s, r) => this.#subject.next({ fn, s, r })
        )
    }
}