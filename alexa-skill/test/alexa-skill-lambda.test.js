const lambdaTester = require('lambda-tester');
const nock = require('nock')
const chai = require('chai');
const chaiExclude = require('chai-exclude');
chai.use(chaiExclude);

const BASE_URL = 'http://127.0.0.1';
const BASIC_AUTH = 'the-basic-authentication';


/**
 * Unit tests for the Alexa Skill (lambda handler) for the Globo Lighting Fabiola 0306.
 *
 * @author Max Stark
 */
describe('Unit tests for the handler method of the lambda function.', () => {

    let testee;

    beforeEach(() => {
        process.env.BASE_URL = BASE_URL;
        process.env.BASIC_AUTH = BASIC_AUTH;

        const lambdaFunction = require('../src/alexa-skill-lambda');
        testee = lambdaTester(lambdaFunction.handler);
    });

    afterEach(() => {
        process.env.BASE_URL = undefined;
        process.env.BASIC_AUTH = undefined;
    });


    test('test lambda handler: Discover', () => {
        // GIVEN
        const discoverDirective = require('./resources/discover-directive.json');
        const discoverResponse = require('./resources/discover-response.json');

        // WHEN
        const result = testee.event(discoverDirective);

        // THEN
        return result.expectSucceed(response =>
            chai.expect(response).excludingEvery('properties').to.deep.equal(discoverResponse));
    });

    test('test lambda handler: ReportState with unknown endpoint (NO_SUCH_ENDPOINT)', () => {
        // GIVEN
        const reportStateDirective = require('./resources/report-state-directive-unknown.json');
        const errorResponse = require('./resources/error-response-NO_SUCH_ENDPOINT.json');

        // WHEN
        const result = testee.event(reportStateDirective);

        // THEN
        return result.expectSucceed(response =>
            chai.expect(response).excludingEvery('message').to.deep.equal(errorResponse));
    });

    test('test lambda handler: ReportState with backend error (INTERNAL_ERROR)', () => {
        // GIVEN
        const reportStateDirective = require('./resources/report-state-directive-light.json');
        const errorResponse = require('./resources/error-response-INTERNAL_ERROR.json');

        nock(BASE_URL, { reqheaders: { authorization: BASIC_AUTH }})
            .get('/light')
            .reply(500)

        // WHEN
        const result = testee.event(reportStateDirective);

        // THEN
        return result.expectSucceed(response =>
            chai.expect(response).excludingEvery('message').to.deep.equal(errorResponse));
    });

    test('test lambda handler: ReportState with error response (BRIDGE_UNREACHABLE)', () => {
        // GIVEN
        const reportStateDirective = require('./resources/report-state-directive-light.json');
        const errorResponse = require('./resources/error-response-BRIDGE_UNREACHABLE.json');

        nock(BASE_URL, { reqheaders: { authorization: BASIC_AUTH }})
            .get('/light')
            .replyWithError("the-error-message")

        // WHEN
        const result = testee.event(reportStateDirective);

        // THEN
        return result.expectSucceed(response =>
            chai.expect(response).to.deep.equal(errorResponse));
    });

    test('test lambda handler: ReportState with malformed response (BRIDGE_UNREACHABLE)', () => {
        // GIVEN
        const reportStateDirective = require('./resources/report-state-directive-light.json');
        const errorResponse = require('./resources/error-response-BRIDGE_UNREACHABLE.json');

        nock(BASE_URL, { reqheaders: { authorization: BASIC_AUTH }})
            .get('/light')
            .reply(200, 'malformed-response')

        // WHEN
        const result = testee.event(reportStateDirective);

        // THEN
        return result.expectSucceed(response =>
            chai.expect(response).excludingEvery('message').to.deep.equal(errorResponse));
    });

    test('test lambda handler: ReportState of Globo light', () => {
        // GIVEN
        const reportStateDirective = require('./resources/report-state-directive-light.json');
        const stateReportResponse = require('./resources/state-report-response-light.json');

        nock(BASE_URL, { reqheaders: { authorization: BASIC_AUTH }})
            .get('/light')
            .reply(200, 'GloboLightStatus.OFF:0')

        // WHEN
        const result = testee.event(reportStateDirective);

        // THEN
        return result.expectSucceed(response =>
            chai.expect(response).excludingEvery('timeOfSample').to.deep.equal(stateReportResponse));
    });

    test('test lambda handler: ReportState of Globo fan', () => {
        // GIVEN
        const reportStateDirective = require('./resources/report-state-directive-fan.json');
        const stateReportResponse = require('./resources/state-report-response-fan.json');

        nock(BASE_URL, { reqheaders: { authorization: BASIC_AUTH }})
            .get('/fan')
            .reply(200, 'GloboFanCommand.OFF')

        // WHEN
        const result = testee.event(reportStateDirective);

        // THEN
        return result.expectSucceed(response =>
            chai.expect(response).excludingEvery('timeOfSample').to.deep.equal(stateReportResponse));
    });

    test('test lambda handler: TurnOn Globo light', () => {
        // GIVEN
        const turnOnDirective = require('./resources/turn-on-directive-light.json');
        const turnOnResponse = require('./resources/turn-on-response-light.json');

        nock(BASE_URL, { reqheaders: { authorization: BASIC_AUTH }})
            .put('/light/ON')
            .reply(200)

        // WHEN
        const result = testee.event(turnOnDirective);

        // THEN
        return result.expectSucceed(response =>
            chai.expect(response).excludingEvery('timeOfSample').to.deep.equal(turnOnResponse));
    });

    test('test lambda handler: SetBrightness Globo light', () => {
        // GIVEN
        const setBrightnessDirective = require('./resources/set-brightness-directive-light.json');
        const setBrightnessResponse = require('./resources/set-brightness-response-light.json');

        nock(BASE_URL, { reqheaders: { authorization: BASIC_AUTH }})
            .put('/light/DIMM/20')
            .reply(200)

        // WHEN
        const result = testee.event(setBrightnessDirective);

        // THEN
        return result.expectSucceed(response =>
            chai.expect(response).excludingEvery('timeOfSample').to.deep.equal(setBrightnessResponse));
    });

    test('test lambda handler: TurnOn Globo fan', () => {
        // GIVEN
        const turnOnDirective = require('./resources/turn-on-directive-fan.json');
        const turnOnResponse = require('./resources/turn-on-response-fan.json');

        nock(BASE_URL, { reqheaders: { authorization: BASIC_AUTH }})
            .put('/fan/LOW')
            .reply(200)

        // WHEN
        const result = testee.event(turnOnDirective);

        // THEN
        return result.expectSucceed(response =>
            chai.expect(response).excludingEvery('timeOfSample').to.deep.equal(turnOnResponse));
    });

    test('test lambda handler: SetPowerLevel Globo fan', () => {
        // GIVEN
        const setPowerLevelDirective = require('./resources/set-powerLevel-directive-fan.json');
        const setPowerLevelResponse = require('./resources/set-powerLevel-response-fan.json');

        nock(BASE_URL, { reqheaders: { authorization: BASIC_AUTH }})
            .put('/fan/MED')
            .reply(200)

        // WHEN
        const result = testee.event(setPowerLevelDirective);

        // THEN
        return result.expectSucceed(response =>
            chai.expect(response).excludingEvery('timeOfSample').to.deep.equal(setPowerLevelResponse));
    });

});
