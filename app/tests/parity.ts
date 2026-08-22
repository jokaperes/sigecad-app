import { h } from "../src/core/hash";

const cases = ["8.0|True", "6.0|True", "None|False", "9.5|True", "AP", "None", "2", "0", "1", "MAT|None"];
for (const c of cases) console.log(`${c}\t${h(c)}`);
