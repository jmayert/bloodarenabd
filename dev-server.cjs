require("ts-node").register({ transpileOnly: true, project: __dirname + "/tsconfig.json" });
process.env.JWT_SECRET = process.env.JWT_SECRET || "testsecret";
const { createApp } = require(__dirname + "/src/app.ts");
createApp().listen(process.env.PORT || 3111, () => console.log("dev server up"));
