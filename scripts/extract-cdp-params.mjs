import fs from "fs";

const payload = JSON.parse(fs.readFileSync(".tmp-cdp-upload.json", "utf8"));
fs.writeFileSync(".tmp-cdp-params.json", JSON.stringify(payload.params));
console.log("written", JSON.stringify(payload.params).length);
