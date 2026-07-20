const fs = require('fs');
const path = require('path');
const https = require('https');

const ALBUMS = {
  'doble': 'B1zG6XBubAwOlP',
  '1rec': 'B1zGY8gBYG3gt3R',
  '2rec': 'B1z5nhQST2SkrN',
  '3rec': 'B1z5Uzl7VMrPwV',
  'casa': 'B1zGrq0zwGiwUap',
  'general': 'B1z5n8hH41MkGD'
};

function postJson(url, host, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (host) {
      options.headers['Host'] = host;
    }
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch(e) {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          reject(new Error(`HTTP status ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function getPartitionHost(token) {
  return new Promise((resolve, reject) => {
    const url = `https://sharedstreams.icloud.com/${token}/sharedstreams/webstream`;
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };
    const req = https.request(options, (res) => {
      const host = res.headers['x-apple-mme-host'];
      if (host) {
        resolve(host);
      } else if (res.statusCode === 330 && res.headers['location']) {
        const locUrl = new URL(res.headers['location']);
        resolve(locUrl.hostname);
      } else {
        // Fallback to base
        resolve(parsedUrl.hostname);
      }
    });
    req.on('error', reject);
    req.write(JSON.stringify({ streamCtag: null }));
    req.end();
  });
}

async function getWebstream(token) {
  const host = await getPartitionHost(token);
  const url = `https://${host}/${token}/sharedstreams/webstream`;
  const data = await postJson(url, host, { streamCtag: null });
  return { host, data };
}

async function getAssetUrls(host, token, photoGuids) {
  const url = `https://${host}/${token}/sharedstreams/webasseturls`;
  const result = await postJson(url, host, { photoGuids });
  return result.items;
}

function getBestDerivativeChecksum(photo) {
  if (!photo.derivatives) return null;
  let bestChecksum = null;
  let maxFileSize = 0;
  for (const key of Object.keys(photo.derivatives)) {
    const d = photo.derivatives[key];
    const size = parseInt(d.fileSize, 10) || 0;
    if (size > maxFileSize) {
      maxFileSize = size;
      bestChecksum = d.checksum;
    }
  }
  return bestChecksum;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    function getUrl(targetUrl) {
      https.get(targetUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          getUrl(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: status ${response.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        reject(err);
      });
    }
    getUrl(url);
  });
}

async function run() {
  console.log('--- STARTING PHOTO IMPORT PROCESS ---');
  
  const results = {};
  
  for (const [key, token] of Object.entries(ALBUMS)) {
    console.log(`\nProcessing album [${key}] with token: ${token}...`);
    try {
      const { host, data } = await getWebstream(token);
      console.log(`  Dynamic host found: ${host}`);
      
      const photos = data.photos || [];
      console.log(`  Found ${photos.length} photos in album.`);
      
      if (photos.length === 0) continue;
      
      // Ensure target directory exists
      const targetDir = path.join(__dirname, 'public', 'images', key);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      // Get GUIDs and best checksums
      const photoGuids = [];
      const guidToChecksum = {};
      const orderedChecksums = [];
      
      for (const p of photos) {
        const checksum = getBestDerivativeChecksum(p);
        if (checksum) {
          photoGuids.push(p.photoGuid);
          guidToChecksum[p.photoGuid] = checksum;
          orderedChecksums.push(checksum);
        }
      }
      
      console.log(`  Resolving download URLs for assets...`);
      const items = await getAssetUrls(host, token, photoGuids);
      
      console.log(`  Downloading photos...`);
      const downloadedFiles = [];
      
      for (let i = 0; i < orderedChecksums.length; i++) {
        const checksum = orderedChecksums[i];
        const asset = items[checksum];
        if (!asset) {
          console.warn(`  Warning: Could not resolve URL for checksum ${checksum}`);
          continue;
        }
        
        const downloadUrl = `https://${asset.url_location}${asset.url_path}`;
        const fileName = `${i + 1}.jpg`;
        const destPath = path.join(targetDir, fileName);
        
        process.stdout.write(`    [${i + 1}/${orderedChecksums.length}] Downloading ${fileName}... `);
        try {
          await downloadFile(downloadUrl, destPath);
          downloadedFiles.push(`/images/${key}/${fileName}`);
          console.log('Success');
        } catch (err) {
          console.log(`Failed: ${err.message}`);
        }
      }
      
      results[key] = downloadedFiles;
      
    } catch (err) {
      console.error(`  Error processing album [${key}]:`, err.message);
    }
  }
  
  console.log('\n\n--- IMPORT COMPLETED ---');
  console.log('Use the following arrays to update your files:\n');
  
  for (const [key, files] of Object.entries(results)) {
    console.log(`Array for [${key}]:`);
    console.log(JSON.stringify(files, null, 2));
    console.log();
  }
}

run();
