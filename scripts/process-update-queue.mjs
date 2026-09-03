const base = process.env.LOCAL_APP_URL || "http://localhost:3000";
const response = await fetch(`${base}/api/update-queue/process`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({limit:1})});
console.log(JSON.stringify(await response.json(), null, 2));
process.exit(response.ok ? 0 : 1);
