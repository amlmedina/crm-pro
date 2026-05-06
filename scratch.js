const fs = require('fs');
// Wait, we don't have the live data locally. The leads are fetched from the API.
// We can't query the live leads directly from the local machine because it's a browser app pulling from GAS.
