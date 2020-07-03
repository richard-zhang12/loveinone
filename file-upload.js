const aws = require('aws-sdk');
const multer = require('multer');
const multers3 = require('multer-s3');
const keys = require('./config/keys');

aws.config.update({
    accessKeyId: keys.AWSAccessKeyID,
    secretAccessKey: keys.AWSAccessKeySecret,
    region: 'us-east-2'
});
const s3 = new aws.S3();

// const fileFilter = (req, file, db) => {
//     if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
//         cb(null, true)
//     } else {
//         cb(new Error('Invalid image type, only JPEG and PNG'), false);
//     }
// }

const upload = multer({
    // fileFilter: fileFilter,
    storage: multers3({
        s3: s3,
        bucket: 'online-dating-app2',
        acl: 'public-read',
        metadata: (req, file, cb) => {
            cb(null, {fieldName: file.fieldname});
        },
        key: (req, file, cb) => {
            cb(null, file.originalname);
        },
        rename: (fieldName, fileName) => {
            return fileName.replace(/\w+/g,'-').toLowerCase();
        }
        })
    });
module.exports = upload;