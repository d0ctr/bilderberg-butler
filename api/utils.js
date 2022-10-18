const HTML_BODY = `<!DOCTYPE html>
<html lang="">
<head>
<title>Bilderberg Butler API</title>
<style>
table, tr, th {
  border: 2px solid black;
  margin: 5px;
}

th {
  padding: 5px;
}

thead {
    background-color: lightgrey;
}
</style>
</head>
<body>
{{body}}
</body>
</html>`;

function getHTMLResponse(body) {
    return HTML_BODY.replace("{{body}}", body);
}

module.exports = { getHTMLResponse };