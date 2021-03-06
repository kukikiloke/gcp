'use strict';

const chai = require('chai');
const sinon = require('sinon');
const vision = require('@google-cloud/vision');
const pubsub = require('@google-cloud/pubsub');

const index = require('./index');

const DETECT_RESULTS = { label: ['text'] };
const VALID_IMAGE_URL = 'http://ok.jpg';
const INVALID_IMAGE_URL = './not-ok.jpg';
const TEST_TYPES = ['label'];
const INVALID_TYPE = 'invalidType';
const TEST_TOPIC = 'testTopic';
const TEST_MESSAGE_ID = 'testMessageId';

chai.should();

describe('Cloud Function Handler - imageProcessing', function() {
	// TODO: Handle promise rejection by Google Cloud library
	// because of no default credentials
	const publishSpy = sinon.stub().returns(
		Promise.resolve([TEST_MESSAGE_ID])
	);

	const formatPubsubData = (imageUrl, types, publishTopic) => ({
		data: {
			data: Buffer.from(
				JSON.stringify(
					{ imageUrl, types, publishTopic }
				)
			).toString('base64')
		}
	});
	const formatSDKData = (imageUrl, types, publishTopic) => ({
		data: { imageUrl, types, publishTopic }
	});
	const rethrowErrorIfNotExpected = (err, expectedMessage) => {
		if (err.indexOf(expectedMessage) < 0) {
			throw err;
		}
	};

	before(function() {
		sinon.stub(vision.prototype, 'detect');
		vision.prototype.detect.returns(Promise.resolve([DETECT_RESULTS]));

		sinon.stub(pubsub.prototype, 'topic');
		pubsub.prototype.topic.returns({
			get: () => Promise.resolve([{
				publish: publishSpy
			}])
		});
	});

	after(() => {
		vision.prototype.detect.restore();
		pubsub.prototype.topic.restore();
	});

	it('Valid image url and default detection types', function() {
		const dataWithValidImageUrl = formatPubsubData(VALID_IMAGE_URL);
		const defaultTypes = [
			'crops', 'text', 'faces', 'labels', 'safeSearch', 'similar'
		];

		return index.imageProcessing(dataWithValidImageUrl)
			.then(resp => {
				vision.prototype.detect.lastCall.args[1]
					.should.deep.equal(defaultTypes);
				resp.should.equal(DETECT_RESULTS);
			});
	});

	it('Invalid image url with relative path', function() {
		const dataWithInvalidImageUrl = formatPubsubData(INVALID_IMAGE_URL);

		return index.imageProcessing(dataWithInvalidImageUrl)
			.then(resp => Promise.reject('Relative image url should fail.'))
			.catch(err => {
				const expectedPartialErrorMessage
					= 'Only http(s) protocol is allowed for image source:';

				rethrowErrorIfNotExpected(err, expectedPartialErrorMessage);
			});
	});

	it('Missing image url', function() {
		const dataWithNoImageUrl = formatPubsubData();

		return index.imageProcessing(dataWithNoImageUrl)
			.then(resp => Promise.reject('Missing image url should fail.'))
			.catch(err => {
				const expectedErrorMessage = 'No image Url provided.';

				rethrowErrorIfNotExpected(err, expectedErrorMessage);
			});
	});

	it('Publish topic', function() {
		const dataWithPublishTopic = formatPubsubData(
			VALID_IMAGE_URL, undefined, TEST_TOPIC
		);

		return index.imageProcessing(dataWithPublishTopic)
			.then(resp => publishSpy.lastCall.calledWith(resp).should.be.true);
	});

	it('Custom detection types', function() {
		const dataWithTEST_TYPES = formatPubsubData(VALID_IMAGE_URL, TEST_TYPES);

		return index.imageProcessing(dataWithTEST_TYPES)
			.then(resp => {
				vision.prototype.detect.lastCall.args[1]
					.should.deep.equal(TEST_TYPES);
			});
	});

	it('Invalid detection types', function() {
		const dataWithInvalidTypes = formatPubsubData(VALID_IMAGE_URL, INVALID_TYPE);

		return index.imageProcessing(dataWithInvalidTypes)
			.then(resp => Promise.reject('Invalid types should fail.'))
			.catch(err => {
				const expectedErrorMessage = 'Types must be a non-empty array.';

				rethrowErrorIfNotExpected(err, expectedErrorMessage);
			});
	});

	it('Data from Google Cloud SDK/CLI', function() {
		const validData = formatSDKData(
			VALID_IMAGE_URL, TEST_TYPES, TEST_TOPIC
		);

		return index.imageProcessing(validData)
			.then(resp => {
				resp.should.equal(DETECT_RESULTS);
				vision.prototype.detect.lastCall.args[1]
					.should.deep.equal(TEST_TYPES);
				publishSpy.lastCall.calledWith(resp).should.be.true;
			});
	});
});
