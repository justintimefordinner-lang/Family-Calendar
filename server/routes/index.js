const express = require('express');
const { requireParent } = require('../auth');

const router = express.Router();

router.use(require('./auth'));      // login / logout / setup
router.use(require('./public'));    // kiosk-facing, no login
router.use(requireParent, require('./parent'));  // everything else needs the parent PIN

router.use((req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = router;
