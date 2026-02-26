import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import colors from '../src/utils/colors.js';

chai.use(chaiAsPromised);
chai.use(deepEqualInAnyOrder);

colors.enabled = true;
