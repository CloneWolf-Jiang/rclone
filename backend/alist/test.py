import http.client

conn = http.client.HTTPSConnection("nas.espiot.top:5244")
payload = b"Test"
headers = {
   'Authorization': "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InJjbG9uZSIsInB3ZF90cyI6MCwiZXhwIjoxNzcxMTU3NjYzLCJuYmYiOjE3NzA5ODQ4NjMsImlhdCI6MTc3MDk4NDg2M30.810Zm4AuTLfPn210TrvRfc2EyFBnJf2RqtAsponXHRc",
   'File-Path': '%2FTest-A.txt',
   'Content-Length': 3,
   'As-Task': 'true',
   'Content-Type': 'application/octet-stream'  ##不要修改这里
}
conn.request("PUT", "/api/fs/put", payload, headers)
res = conn.getresponse()
data = res.read()
print(data.decode("utf-8"))