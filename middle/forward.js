var http = require('http');

var util = require('../lib/util');

module.exports = function (options)
{
    var filterType = options.filterType,
        forwardId = options.forwardId;

    return function *(next)
    {
        var target = this.target,
            req = this.req,
            path = this.originalUrl;

        this.logger.info(`forward address: ${target.ip}:${target.port}(${target.name})`);

        if (forwardId) path = util.addQuery(path, 'freego', this.id);

        this.targetRes = yield request.call(this, {
            port: target.port,
            hostname: target.ip,
            method: req.method,
            headers: req.headers,
            path
        });

        if (this.targetRes.done) return;

        yield next;
    };

    function request(options)
    {
        return new Promise((resolve, reject) =>
        {
            var chunks = [];

            var proxyReq = http.request(options, (proxyRes) =>
            {
                var contentType = proxyRes.headers['content-type'];

                // If the response is not html, we just pipe it back immediately.
                this.status = proxyRes.statusCode;

                var pipeBackImmediately = !(contentType && filterType.some(val => contentType.indexOf(val) > -1));
                if (pipeBackImmediately)
                {
                    util.each(proxyRes.headers, (val, key) => this.set(key, val));
                    proxyRes.pipe(this.res);
                    proxyRes.on('data', () => {});
                    proxyRes.on('end', () => {
                        this.res.end();
                        resolve({done: true});
                    });
                    return;
                }

                proxyRes.on('data', (chunk) => chunks.push(chunk));
                proxyRes.on('error', (err) => reject(err));
                proxyRes.on('end', () => resolve({
                    headers: proxyRes.headers,
                    done: false,
                    body: Buffer.concat(chunks)
                }));
            });

            if (this.req.method === 'POST')
            {
                var body = [];
                this.req.on('data', chunk => body.push(chunk))
                    .on('end', () =>
                    {
                        body = Buffer.concat(body).toString();
                        if (body.trim() !== '') this.reqBody = `\n${body}\n`;
                    });
            }

            proxyReq.on('error', (err) => reject(err));
            this.req.pipe(proxyReq);
        });
    }
};
