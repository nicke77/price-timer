const fs = require("fs");

const secretPath = "/data/.credential-secret";
const credentialSecret = fs.readFileSync(secretPath, "utf8").trim();

module.exports = {
    uiPort: process.env.PORT || 1880,
    flowFile: "flows.json",
    flowFilePretty: true,
    credentialSecret,
    editorTheme: {
        page: {
            title: "price-timer dev"
        },
        projects: {
            enabled: false
        }
    },
    logging: {
        console: {
            level: "debug",
            metrics: false,
            audit: false
        }
    },
    exportGlobalContextKeys: false,
    functionExternalModules: true,
    debugMaxLength: 1000,
    contextStorage: {
        default: {
            module: "memory"
        }
    }
};
